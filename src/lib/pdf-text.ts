import "server-only";
import parse from "pdf-parse/lib/pdf-parse.js";
import { MAX_PITCH_PAGES, MAX_PITCH_CHARS, PITCH_PAGE_LIMIT, PITCH_TEXT_LIMIT, normaliseSource } from "./pitch-document";
import { PublicError } from "./public-error";

export async function readPdfText(file: File, max: number): Promise<string> {
  // PDF.js slices and reverses portions of the input. Buffer.slice() aliases
  // the original bytes; a plain Uint8Array gives these operations copy semantics.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await parse(bytes, { max });
  return result.text || "";
}

export async function readPitchPdfPages(file: File): Promise<string[]> {
  const pages: string[] = [];
  let characters = 0;
  const result = await parse(new Uint8Array(await file.arrayBuffer()), {
    max: MAX_PITCH_PAGES,
    pagerender: async page => {
      if (characters > MAX_PITCH_CHARS) return "";
      const items = (await page.getTextContent()).items;
      const text = normaliseSource(items.map(i => i.str).join(" "));
      characters += text.length;
      if (characters <= MAX_PITCH_CHARS) pages[page.pageNumber - 1] = text;
      // pdf-parse otherwise builds a second copy of the entire document.
      return "";
    },
  });
  if (result.numpages > MAX_PITCH_PAGES) throw new PublicError(PITCH_PAGE_LIMIT, 413);
  if (characters > MAX_PITCH_CHARS) throw new PublicError(PITCH_TEXT_LIMIT, 413);
  return Array.from({ length: result.numpages }, (_, i) => pages[i] || "");
}
