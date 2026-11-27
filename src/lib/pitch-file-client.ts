import pdfPackage from "pdfjs-dist/package.json";
import { MAX_PITCH_PAGES, MAX_PITCH_CHARS, PITCH_PAGE_LIMIT, PITCH_TEXT_LIMIT, normaliseSource } from "./pitch-document";

// Large binaries stay on the device. Only capped page-labelled text is posted to the API.
export async function readLargePitchFile(file: File, onPage: (page: number, total: number) => void): Promise<string[]> {
  const base = "/pitch/reader/" + pdfPackage.version;
  const url = base + "/pdf.min.mjs";
  const pdfjs: typeof import("pdfjs-dist") = await import(/* webpackIgnore: true */ url);
  pdfjs.GlobalWorkerOptions.workerSrc = base + "/pdf.worker.min.mjs";
  return readPitchFilePages(file, onPage, pdfjs, base + "/");
}

export async function readPitchFilePages(file: File, onPage: (page: number, total: number) => void,
  pdfjs: Pick<typeof import("pdfjs-dist"), "getDocument">, assets: string): Promise<string[]> {
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), cMapUrl: assets + "cmaps/",
    standardFontDataUrl: assets + "standard_fonts/",
    cMapPacked: true, disableFontFace: true, useSystemFonts: false, useWasm: false, isOffscreenCanvasSupported: false });
  try {
    const doc = await task.promise;
    if (doc.numPages > MAX_PITCH_PAGES) throw new Error(PITCH_PAGE_LIMIT);
    const pages: string[] = [];
    let length = 0;
    for (let n = 1; n <= doc.numPages; n++) {
      onPage(n, doc.numPages);
      const page = await doc.getPage(n);
      try {
        const { items } = await page.getTextContent();
        const text = normaliseSource(items.map(x => "str" in x ? x.str : "").join(" "));
        length += text.length;
        if (length > MAX_PITCH_CHARS) throw new Error(PITCH_TEXT_LIMIT);
        pages.push(text);
      } finally { page.cleanup(); }
    }
    return pages;
  } finally { await task.destroy(); }
}
