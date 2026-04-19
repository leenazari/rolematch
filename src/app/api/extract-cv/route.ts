import { NextRequest, NextResponse } from "next/server";
import { anthropic, HAIKU } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 30;

const EXTRACT_PROMPT = `You extract structured data from CV text. Respond with ONLY valid JSON. No preamble. No code fences. No em dashes anywhere in any value.

Return this exact shape:
{
  "name": "string",
  "currentRole": "string (most recent or current job title)",
  "sector": "string (industry, e.g. Retail, Healthcare, Tech, Education)",
  "yearsExperience": number (total years of professional work),
  "keySkills": ["string", "string", ...] (5-10 most relevant),
  "education": "string (highest qualification, brief)",
  "notableEmployers": ["string", "string", ...] (up to 5 employer names)
}

If a field is unclear, make your best inference rather than leaving it empty. Use empty array if no skills or employers found.`;

async function extractFromText(rawText: string) {
  const trimmed = rawText.slice(0, 12000);

  const msg = await anthropic.messages.create({
    model: HAIKU,
    max_tokens: 1024,
    system: EXTRACT_PROMPT,
    messages: [{ role: "user", content: trimmed }],
  });

  const textBlock = msg.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from AI");
  }

  let cleaned = textBlock.text.trim();
  cleaned = cleaned.replace(/```json|```/g, "").trim();

  const data = JSON.parse(cleaned);
  return { ...data, rawText: trimmed };
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    let rawText = "";

    if (contentType.includes("application/json")) {
      const body = await req.json();
      rawText = body.text || "";
    } else {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ ok: false, error: "No file uploaded" }, { status: 400 });
      }
      const buffer = Buffer.from(await file.arrayBuffer());

      const pdfParse = (await import("pdf-parse")).default;
      const parsed = await pdfParse(buffer);
      rawText = parsed.text;
    }

    if (!rawText || rawText.trim().length < 50) {
      return NextResponse.json(
        { ok: false, error: "CV text too short or empty. Try pasting the text directly." },
        { status: 400 }
      );
    }

    const data = await extractFromText(rawText);
    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    console.error("extract-cv error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to extract CV" },
      { status: 500 }
    );
  }
}
