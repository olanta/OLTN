import { afterEach, describe, expect, it, vi } from "vitest";
import {
  altTextConfigured,
  altTextLanguage,
  cleanAltText,
  DEFAULT_ALT_TEXT_SETTINGS,
  generateAltText,
} from "../alt-text";

describe("altTextConfigured", () => {
  it("requires a Gemini key and model", () => {
    expect(altTextConfigured(DEFAULT_ALT_TEXT_SETTINGS)).toBe(false);
    expect(altTextConfigured({ ...DEFAULT_ALT_TEXT_SETTINGS, geminiKey: "key" })).toBe(true);
    expect(
      altTextConfigured({ ...DEFAULT_ALT_TEXT_SETTINGS, geminiKey: "key", geminiModel: "" }),
    ).toBe(false);
  });
});

describe("altTextLanguage", () => {
  it("maps app languages to Gemini language codes", () => {
    expect(altTextLanguage("pt-BR")).toBe("pt");
    expect(altTextLanguage("en")).toBe("en");
    expect(altTextLanguage("fr")).toBe("en");
  });
});

describe("cleanAltText", () => {
  it("strips labels, fences, ANSI codes and wraps", () => {
    expect(cleanAltText("Here's alt text for the image: A cat\non a sofa.")).toBe(
      "A cat on a sofa.",
    );
    expect(cleanAltText("```\nAlt text: a red bus ```")).toBe("a red bus");
    expect(cleanAltText("\u001b[31mDescrição: um gato\u001b[0m")).toBe("um gato");
  });
});

describe("generateAltText", () => {
  it("rejects unsupported media before any network call", async () => {
    const file = new File(["x"], "notes.txt", { type: "text/plain" });
    await expect(
      generateAltText(file, {
        settings: {
          ...DEFAULT_ALT_TEXT_SETTINGS,
          geminiKey: "key",
        },
      }),
    ).rejects.toMatchObject({ kind: "unsupported" });
  });

  it("reports a missing configuration", async () => {
    const file = new File(["x"], "photo.jpg", { type: "image/jpeg" });
    await expect(
      generateAltText(file, { settings: DEFAULT_ALT_TEXT_SETTINGS }),
    ).rejects.toMatchObject({ kind: "config" });
  });
});

describe("generateAltText with Gemini", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends inline image data and cleans the model response", async () => {
    const fetchMock = vi.fn((_url: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            candidates: [
              { content: { parts: [{ text: "Here's alt text for the image: A red bus." }] } },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["jpeg-bytes"], "photo.jpg", { type: "image/jpeg" });
    const text = await generateAltText(file, {
      settings: {
        ...DEFAULT_ALT_TEXT_SETTINGS,
        geminiKey: "key",
        geminiModel: "gemini-test",
      },
    });
    expect(text).toBe("A red bus.");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("models/gemini-test:generateContent");
    expect((init?.headers as Record<string, string>)["x-goog-api-key"]).toBe("key");
    const body = JSON.parse(String(init?.body));
    expect(body.contents[0].parts[0].text).toContain("alt-text");
    expect(body.contents[0].parts[1].inline_data.mime_type).toBe("image/jpeg");
    expect(body.contents[0].parts[1].inline_data.data).toBeTruthy();
  });

  it("falls back to another Gemini model on 404", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
        calls += 1;
        if (calls === 1) return Promise.resolve(new Response("", { status: 404 }));
        return Promise.resolve(
          new Response(
            JSON.stringify({
              candidates: [{ content: { parts: [{ text: "A blue car." }] } }],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        );
      }),
    );
    const file = new File(["jpeg-bytes"], "photo.jpg", { type: "image/jpeg" });
    const text = await generateAltText(file, {
      settings: {
        ...DEFAULT_ALT_TEXT_SETTINGS,
        geminiKey: "key",
        geminiModel: "missing-model",
      },
    });
    expect(text).toBe("A blue car.");
    expect(calls).toBe(2);
  });

  it("reports website restrictions separately from an invalid key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
        Promise.resolve(
          new Response("Requests from referer http://localhost:5173/ are blocked.", {
            status: 403,
          }),
        ),
      ),
    );
    const file = new File(["jpeg-bytes"], "photo.jpg", { type: "image/jpeg" });
    await expect(
      generateAltText(file, {
        settings: {
          ...DEFAULT_ALT_TEXT_SETTINGS,
          geminiKey: "key",
        },
      }),
    ).rejects.toMatchObject({ kind: "referer" });
  });
});
