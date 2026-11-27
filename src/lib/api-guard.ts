import "server-only";
import { createHmac } from "node:crypto";
import { pitchStorageClient } from "./pitch-storage";
import { PublicError } from "./public-error";

const limits = { upload: 18, interview: 100, audio: 180, report: 12, session: 30, email: 30 } as const;
type Bucket = keyof typeof limits;

export function checkRequest(req: Request, maxBytes: number) {
  const origin = req.headers?.get("origin");
  if (origin && origin !== new URL(req.url).origin) throw new PublicError("Invalid request origin.", 403);
  if (Number(req.headers?.get("content-length")) > maxBytes) throw new PublicError("This request is too large.", 413);
}

export async function checkUsage(req: Request, bucket: Bucket) {
  if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) return;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new PublicError("This service is temporarily unavailable. Please try again.", 503);
  // On Vercel this header is set by its edge. Do not trust an address supplied by request JSON or arbitrary proxies.
  const address = process.env.VERCEL === "1" ? req.headers?.get("x-vercel-forwarded-for")?.split(",")[0].trim() : null;
  const day = new Date().toISOString().slice(0, 10);
  const actor = createHmac("sha256", key).update("pitch-api-usage:" + day + ":" + (address || "shared")).digest("hex");
  let allowed: boolean;
  try {
    const { data, error } = await pitchStorageClient().rpc("consume_pitch_api_usage", {
      p_actor: actor, p_bucket: bucket, p_limit: limits[bucket],
    });
    if (error || typeof data !== "boolean") throw new Error("Unavailable");
    allowed = data;
  } catch {
    throw new PublicError("This service is temporarily unavailable. Please try again.", 503);
  }
  if (!allowed) {
    const wait = 600 - Math.floor(Date.now() / 1000) % 600;
    throw new PublicError("Too many requests from this network. Please try again in a few minutes.", 429, wait);
  }
}
