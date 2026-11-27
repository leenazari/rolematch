import type { PitchData, PitchSource } from "@/types";

export const MAX_PITCH_PAGES = 100;
export const MAX_PITCH_BYTES = 20_000_000;
export const MAX_PITCH_CHARS = 240_000;
export const DIRECT_PDF_BYTES = 4_000_000;
export const PITCH_TEXT_LIMIT = "This plan has more than 240,000 characters. Export a shorter version or remove supporting appendices and try again.";
export const PITCH_PAGE_LIMIT = "This PDF has more than 100 pages. Export your plan and its key appendices as a shorter PDF.";
export const PITCH_FILE_LIMIT = "This PDF is over 20 MB. Compress it or export it at a smaller size and try again.";
export const MIN_PITCH_TEXT = 200;
export const normaliseSource = (text: string) => text.normalize("NFC").replace(/\u00ad/g, "").replace(/\s+/g, " ").trim();
export const hasPageText = (text: string) => !!text && !/^(?:(?:page|p\.)\s*)?\d{1,4}(?:\s*(?:of|\/)\s*\d{1,4})?$/i.test(text);

type Quote = PitchSource["evidence"][number];
export function buildSource(kind: PitchSource["kind"], pages: string[], suggested: Quote[]): PitchSource {
  const evidence: Quote[] = [];
  const add = (page: number, quote: string) => {
    if (!Number.isInteger(page) || page < 1 || page > pages.length || typeof quote !== "string") return;
    const clean = normaliseSource(quote);
    if (clean.length < 10 || clean.length > 320 || !pages[page - 1].includes(clean) ||
        evidence.some(item => item.page === page && item.quote === clean)) return;
    evidence.push({ page, quote: clean });
  };
  for (const e of suggested || []) {
    if (e && evidence.length < 12) add(e.page, e.quote);
  }
  // Preserve a real extract if the model's citations cannot be matched, and protect a numeric appendix.
  const readable = pages.map((text, i) => hasPageText(text) ? i + 1 : 0).filter(Boolean);
  const snippet = (page: number) => {
    const sentences = pages[page - 1].split(/(?<=[.!?])\s+|\s*[;|]\s*/);
    const quote = sentences.find(s => /[£$€%]|\b(?:raising|revenue|runway|margin|paying|forecast)\b/i.test(s) && s.length >= 10) ||
      sentences.find(s => s.length >= 10) || pages[page - 1];
    add(page, quote.slice(0, 280).trim());
  };
  if (!evidence.length && readable.length) {
    [...new Set([readable[0], readable[Math.floor(readable.length / 2)], readable[readable.length - 1]])].forEach(snippet);
  }
  const lastNumeric = [...readable].reverse().find(p => /[£$€%]|\b(?:funding|forecast|runway|gross margin)\b/i.test(pages[p - 1]));
  if (lastNumeric && !evidence.some(e => e.page === lastNumeric)) snippet(lastNumeric);
  return { kind, pageCount: pages.length, unreadablePages: pages.flatMap((t, i) => hasPageText(t) ? [] : [i + 1]), evidence };
}

export function pitchSourceContext(data: PitchData): string {
  const source = data.sourceDocument;
  if (!source || !Array.isArray(source.evidence)) return (data.rawText || "").slice(0, 9000);
  const label = source.kind === "pdf" ? "PDF page" : "Text section";
  const excerpts = source.evidence.slice(0, 13).map(e => `[${label} ${e.page}] ${e.quote.slice(0, 320)}`).join("\n");
  const missing = source.unreadablePages?.length ? "\nNo readable text on: " + source.unreadablePages.join(", ") + ". Do not infer content there." : "";
  const note = source.founderNote ? "\nFounder clarification (not a document quote): " + source.founderNote.slice(0, 1200) : "";
  return (excerpts + missing + note + (data.rawText ? "\nShort source text: " + data.rawText : "")).slice(0, 9000);
}
