import "server-only";
import parse from "pdf-parse/lib/pdf-parse.js";

export async function readPdfText(file: File, max: number): Promise<string> {
  // PDF.js slices and reverses portions of the input. Buffer.slice() aliases
  // the original bytes; a plain Uint8Array gives these operations copy semantics.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await parse(bytes, { max });
  return result.text || "";
}
