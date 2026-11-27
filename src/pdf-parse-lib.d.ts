declare module "pdf-parse/lib/pdf-parse.js" {
  export default function parse(bytes: Uint8Array, options: { max: number }): Promise<{ text: string }>;
}
