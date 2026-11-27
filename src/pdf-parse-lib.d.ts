declare module "pdf-parse/lib/pdf-parse.js" {
  interface PdfPage { pageNumber: number; getTextContent(): Promise<{ items: { str: string }[] }> }
  export default function parse(bytes: Uint8Array, options: { max: number; pagerender?: (page: PdfPage) => Promise<string> }): Promise<{ text: string; numpages: number }>;
}
