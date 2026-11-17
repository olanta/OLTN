/* Alt-text generation adapted from Altbot's prompts and post-processing.
   Gemini runs directly from the browser with the user's own API key. */

import { t } from "../i18n/pt-BR";
import { readJSON, writeJSON } from "./storage";

export interface AltTextSettings {
  geminiKey: string;
  geminiModel: string;
}

export const DEFAULT_ALT_TEXT_SETTINGS: AltTextSettings = {
  geminiKey: "",
  geminiModel: "gemini-3.5-flash-lite",
};

const STORAGE_KEY = "altText";
const MAX_IMAGE_EDGE = 1280;
const MAX_VIDEO_INLINE_BYTES = 10 * 1024 * 1024;
const MAX_MEDIA_BYTES = 50 * 1024 * 1024;

export type AltTextLanguage = "en" | "pt";

const PROMPTS: Record<AltTextLanguage, { image: string; video: string; frames: string }> = {
  en: {
    image:
      "Generate an alt-text description, which is a description for people who can't see the image. Be sure to talk about the actual contents of it, do not interpret or assume anything. Start with a general description, then focus on the details. If the image is complex or has many different elements, please try to summarize it in around 5 sentences. If there is any text, state it verbatim. Do not assume genders. Write your alt-text on the next line:",
    video:
      "Generate an alt-text description, which is a description for people who can't hear or see this video. Be sure to say the actual exact contents of the video, do not interpret or assume anything. Include details about the audio and video. If something is said, transcribe it word for word. If there is any text, state it verbatim. Do not assume genders. Write your alt-text on the next line:",
    frames:
      "These images are frames sampled from a video. Generate an alt-text description for people who can't see the video. Describe the actual contents and what changes between the frames; do not interpret or assume anything. If there is visible text, state it verbatim. Do not assume genders. Write your alt-text on the next line:",
  },
  pt: {
    image:
      "Gere uma descrição de texto alternativo para pessoas que não podem ver a imagem. Descreva apenas o conteúdo real, não interprete nem faça suposições. Comece com uma descrição geral e depois passe aos detalhes. Se a imagem for complexa ou tiver muitos elementos, resuma-a em cerca de 5 frases. Se houver texto, escreva-o exatamente. Não assuma gêneros. Escreva seu alt-text na próxima linha:",
    video:
      "Gere uma descrição de texto alternativo para o vídeo, que é para pessoas que não podem vê-lo ou ouvi-lo. Descreva apenas o conteúdo real, não interprete nem faça suposições. Inclua detalhes sobre o áudio e o vídeo. Se algo for dito, transcreva palavra por palavra. Se houver texto, escreva-o exatamente. Não assuma gêneros. Escreva seu alt-text na próxima linha:",
    frames:
      "Estas imagens são quadros amostrados de um vídeo. Gere uma descrição de texto alternativo para pessoas que não podem ver o vídeo. Descreva apenas o conteúdo real e o que muda entre os quadros, não interprete nem faça suposições. Se houver texto visível, escreva-o exatamente. Não assuma gêneros. Escreva seu alt-text na próxima linha:",
  },
};

export type AltTextErrorKind =
  | "config"
  | "auth"
  | "limit"
  | "blocked"
  | "unsupported"
  | "too-large"
  | "network"
  | "referer"
  | "model"
  | "server";

export class AltTextError extends Error {
  readonly kind: AltTextErrorKind;

  constructor(kind: AltTextErrorKind, message = kind) {
    super(message);
    this.name = "AltTextError";
    this.kind = kind;
  }
}

export function altTextErrorMessage(error: unknown): string {
  if (!(error instanceof AltTextError)) return t.altTextError;
  switch (error.kind) {
    case "config":
      return t.altTextConfigure;
    case "auth":
      return t.altTextErrorAuth;
    case "limit":
      return t.altTextErrorLimit;
    case "blocked":
      return t.altTextErrorBlocked;
    case "unsupported":
      return t.altTextErrorUnsupported;
    case "too-large":
      return t.altTextErrorTooLarge;
    case "network":
      return t.altTextErrorNetwork;
    case "referer":
      return t.altTextErrorReferer;
    case "model":
      return t.altTextErrorModel;
    default:
      return t.altTextError;
  }
}

export function readAltTextSettings(): AltTextSettings {
  const raw = readJSON<Partial<AltTextSettings>>(STORAGE_KEY, {});
  const storedModel =
    typeof raw.geminiModel === "string" && raw.geminiModel.trim() ? raw.geminiModel : "";
  const legacyModel = /^gemini-(1|2)\./i.test(storedModel);
  return {
    geminiKey: typeof raw.geminiKey === "string" ? raw.geminiKey : "",
    geminiModel: storedModel && !legacyModel ? storedModel : DEFAULT_ALT_TEXT_SETTINGS.geminiModel,
  };
}

export function writeAltTextSettings(settings: AltTextSettings): void {
  writeJSON(STORAGE_KEY, settings);
}

export function altTextConfigured(settings: AltTextSettings = readAltTextSettings()): boolean {
  return !!settings.geminiKey.trim() && !!settings.geminiModel.trim();
}

export function altTextLanguage(language: string): AltTextLanguage {
  return language.toLowerCase().startsWith("pt") ? "pt" : "en";
}

/** Cleans the model output the same way Altbot does before replying. */
export function cleanAltText(value: string): string {
  return value
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
    .replace(/```[a-zA-Z0-9_-]*/g, " ")
    .trim()
    .replace(
      /^(?:here(?:'s| is) (?:the )?alt[- ]?text[^:]*:|alt[- ]?text\s*:|descri[cç][aã]o[^:]*:)\s*/i,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

type MediaPart = {
  blob: Blob;
  mime: string;
  name: string;
};

async function prepareImage(file: File): Promise<MediaPart> {
  if (!file.type.startsWith("image/")) {
    return { blob: file, mime: file.type || "application/octet-stream", name: file.name };
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    const passthrough = file.type === "image/jpeg" || file.type === "image/png";
    if (passthrough && scale >= 1 && file.size <= 4 * 1024 * 1024) {
      bitmap.close();
      return { blob: file, mime: file.type || "image/jpeg", name: file.name };
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return { blob: file, mime: file.type || "image/jpeg", name: file.name };
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.86),
    );
    return blob
      ? { blob, mime: "image/jpeg", name: "media.jpg" }
      : { blob: file, mime: file.type || "image/jpeg", name: file.name };
  } catch {
    return { blob: file, mime: file.type || "application/octet-stream", name: file.name };
  }
}

function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = (): void => {
      cleanup();
      resolve();
    };
    const fail = (): void => {
      cleanup();
      reject(new AltTextError("unsupported"));
    };
    const cleanup = (): void => {
      video.removeEventListener("seeked", done);
      video.removeEventListener("error", fail);
    };
    video.addEventListener("seeked", done, { once: true });
    video.addEventListener("error", fail, { once: true });
    video.currentTime = time;
  });
}

async function extractVideoFrames(file: File, count: number): Promise<Blob[]> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      video.addEventListener("loadedmetadata", () => resolve(), { once: true });
      video.addEventListener("error", () => reject(new AltTextError("unsupported")), {
        once: true,
      });
    });
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const times =
      count <= 1
        ? [duration ? Math.min(duration * 0.5, 1.5) : 0.1]
        : Array.from({ length: count }, (_, index) =>
            duration ? (duration * (index + 0.5)) / count : 0.1,
          );
    const frames: Blob[] = [];
    for (const time of times) {
      await seekVideo(video, time);
      if (!video.videoWidth || !video.videoHeight) continue;
      const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(video.videoWidth, video.videoHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.85),
      );
      if (blob) frames.push(blob);
    }
    return frames;
  } finally {
    video.removeAttribute("src");
    URL.revokeObjectURL(url);
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new AltTextError("unsupported"));
    reader.readAsDataURL(blob);
  });
}

async function fetchWithErrors(url: string, init: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    throw new AltTextError("network");
  }
  if (res.ok) return res;
  const detail = await res.text().catch(() => "");
  if (
    /referer|referrer|blocked.?origin|origin.*blocked/i.test(detail) &&
    (res.status === 400 || res.status === 403)
  ) {
    throw new AltTextError("referer");
  }
  if (res.status === 401 || res.status === 403 || /api key|invalid.*key/i.test(detail)) {
    throw new AltTextError("auth");
  }
  if (res.status === 429) throw new AltTextError("limit");
  if (res.status === 404) throw new AltTextError("model");
  if (res.status === 413) throw new AltTextError("too-large");
  if (
    res.status === 400 &&
    /model/i.test(detail) &&
    /not found|not supported|unknown|invalid/i.test(detail)
  ) {
    throw new AltTextError("model");
  }
  if (res.status === 400) {
    if (/image|video|media|format|unsupported/i.test(detail)) {
      throw new AltTextError("unsupported");
    }
    throw new AltTextError("server");
  }
  throw new AltTextError("server");
}

interface GeminiResponse {
  candidates?: {
    content?: {
      parts?: { text?: string; thought?: boolean }[];
    };
  }[];
  promptFeedback?: { blockReason?: string };
}

async function generateWithGemini(
  file: File,
  settings: AltTextSettings,
  language: AltTextLanguage,
  signal: AbortSignal,
): Promise<string> {
  if (!settings.geminiKey.trim()) throw new AltTextError("config");
  const model = settings.geminiModel.trim() || DEFAULT_ALT_TEXT_SETTINGS.geminiModel;
  const parts: Record<string, unknown>[] = [];
  let prompt = PROMPTS[language].image;

  if (file.type.startsWith("video/")) {
    if (file.size <= MAX_VIDEO_INLINE_BYTES) {
      prompt = PROMPTS[language].video;
      parts.push({
        inline_data: {
          mime_type: file.type || "video/mp4",
          data: await blobToBase64(file),
        },
      });
    } else {
      prompt = PROMPTS[language].frames;
      const frames = await extractVideoFrames(file, 4);
      if (!frames.length) throw new AltTextError("unsupported");
      for (const frame of frames) {
        parts.push({
          inline_data: { mime_type: "image/jpeg", data: await blobToBase64(frame) },
        });
      }
    }
  } else if (file.type.startsWith("image/")) {
    const image = await prepareImage(file);
    parts.push({
      inline_data: {
        mime_type: image.mime || "image/jpeg",
        data: await blobToBase64(image.blob),
      },
    });
  } else {
    throw new AltTextError("unsupported");
  }

  parts.unshift({ text: prompt });
  const models = [
    ...new Set([
      model,
      "gemini-3.5-flash-lite",
      "gemini-3.6-flash",
      "gemini-3.8-flash",
      "gemini-3.1-flash-lite",
    ]),
  ];
  let lastModelError: AltTextError | null = null;
  for (const candidate of models) {
    const endpoint =
      "https://generativelanguage.googleapis.com/v1beta/models/" +
      `${encodeURIComponent(candidate)}:generateContent`;
    try {
      const res = await fetchWithErrors(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": settings.geminiKey.trim(),
        },
        signal,
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 512 },
        }),
      });
      const data = (await res.json().catch(() => null)) as GeminiResponse | null;
      const text =
        data?.candidates?.[0]?.content?.parts
          ?.filter((part) => typeof part.text === "string" && !part.thought)
          .map((part) => part.text)
          .join("") ?? "";
      if (!text.trim()) {
        throw new AltTextError(data?.promptFeedback?.blockReason ? "blocked" : "server");
      }
      return cleanAltText(text);
    } catch (err) {
      if (err instanceof AltTextError && err.kind === "model") {
        lastModelError = err;
        continue;
      }
      throw err;
    }
  }
  throw lastModelError ?? new AltTextError("model");
}

export async function generateAltText(
  file: File,
  options: {
    language?: string;
    settings?: AltTextSettings;
    signal?: AbortSignal;
  } = {},
): Promise<string> {
  const settings = options.settings ?? readAltTextSettings();
  if (!altTextConfigured(settings)) throw new AltTextError("config");
  if (file.size > MAX_MEDIA_BYTES) throw new AltTextError("too-large");
  const language = altTextLanguage(options.language ?? "en");
  const signal = options.signal ?? AbortSignal.timeout(120_000);
  return generateWithGemini(file, settings, language, signal);
}
