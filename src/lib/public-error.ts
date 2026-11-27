import "server-only";
import { NextResponse } from "next/server";

/** Only throw this with app-written copy; SDK errors, request data and secrets are never public. */
export class PublicError extends Error {
  constructor(message: string, readonly status?: number, readonly retryAfter?: number) { super(message); }
}
export function safeFailure(error: unknown, fallback: string, defaultStatus = 500) {
  const known = error instanceof PublicError ? error : null;
  const status = known?.status ?? defaultStatus;
  if (status >= 500) console.error("API request failed", { status });
  return NextResponse.json({ ok: false, error: known?.message || fallback }, { status, headers: {
    "Cache-Control": "no-store", ...(known?.retryAfter ? { "Retry-After": String(known.retryAfter) } : {}),
  } });
}
