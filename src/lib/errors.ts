import { t } from "../i18n/pt-BR";

/* Typed errors + friendly messages (never leaks internal details). */

export class HttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Extracts the HTTP status from an error (our HttpError or MastoHttpError). */
export function httpStatusOf(error: unknown): number | null {
  return statusFrom(error, 0);
}

function statusFrom(value: unknown, depth: number): number | null {
  if (depth > 3) return null;
  if (value instanceof HttpError) return value.status;
  if (!value || typeof value !== "object") return null;
  const record = value as {
    status?: unknown;
    statusCode?: unknown;
    response?: unknown;
    cause?: unknown;
    error?: unknown;
  };
  if (typeof record.status === "number") return record.status;
  if (typeof record.statusCode === "number") return record.statusCode;
  for (const nested of [record.response, record.cause, record.error]) {
    const status = statusFrom(nested, depth + 1);
    if (status != null) return status;
  }
  return null;
}

export function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && /timeout/i.test(error.name);
}

/**
 * Friendly message for the user from an error.
 * `fallback` keeps the action context ("could not save").
 */
export function userMessageForError(error: unknown, fallback: string = t.errorGeneric): string {
  const status = httpStatusOf(error);
  if (status === 401) return t.loggedOut;
  if (status === 403) return t.errorForbidden;
  if (status === 404) return t.errorNotFound;
  if (status === 429) return t.errorRateLimit;
  if (status != null && status >= 500) return fallback;
  if (isTimeoutError(error) || error instanceof TypeError) return t.errorNetwork;
  return fallback;
}
