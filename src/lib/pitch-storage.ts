import { createClient } from "@supabase/supabase-js";

export const PITCH_PDF_BUCKET = "pitch-reports";

export function pitchStorageClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Report saving is not configured. Please contact support.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(8_000) }) },
  });
}

export async function savePitchPdf(path: string, pdf: Buffer) {
  const db = pitchStorageClient();
  const { data: bucket, error: bucketError } = await db.storage.getBucket(PITCH_PDF_BUCKET);
  if (bucketError) {
    if (!/not found/i.test(bucketError.message)) throw new Error("PDF storage is temporarily unavailable.");
    const { error } = await db.storage.createBucket(PITCH_PDF_BUCKET, {
      public: false, fileSizeLimit: 5 * 1024 * 1024, allowedMimeTypes: ["application/pdf"],
    });
    if (error && !/already exists/i.test(error.message)) throw new Error("PDF storage could not be created.");
  } else if (bucket.public) {
    throw new Error("PDF storage must be private.");
  }
  const { error } = await db.storage.from(PITCH_PDF_BUCKET).upload(path, pdf, { contentType: "application/pdf", upsert: true });
  if (error) throw new Error("The PDF could not be saved yet.");
}
