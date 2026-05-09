import { NextRequest, NextResponse } from "next/server";
import { anthropic, HAIKU } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 30;

const EXTRACT_PROMPT = `You extract structured data from a startup founder's pitch one-pager or executive summary. Respond with ONLY valid JSON. No preamble. No code fences. No em dashes anywhere in any value.

Return this exact shape:
{
  "companyName": "string (the startup or product name)",
  "oneLineDescription": "string (one sentence describing what the company does, not what it aspires to)",
  "problem": "string (the core problem they solve, in plain language, 1-2 sentences)",
  "targetCustomer": "string (specifically who buys this, 1 sentence)",
  "sector": "string (the industry, e.g. Fintech, Healthtech, B2B SaaS, Climate, Retail Tech, Marketplace, Consumer)",
  "stage": "string (one of: 'idea', 'pre-revenue', 'early revenue', 'revenue', 'scaling')",
  "teamSize": "string (number of full-time team members, or description like 'two co-founders' if not numeric)",
  "founderBackground": "string (brief: where they came from, 1-2 sentences)",
  "traction": "string (any concrete traction mentioned: customers, revenue, users, partnerships, pilots. If none mentioned, write 'No traction details mentioned')",
  "ask": "string (the amount they want to raise, or 'Not specified' if not mentioned. Keep their exact phrasing if specified, e.g. '£500k seed' or '£1M-£2M target')"
}

Rules:
- Be specific, not generic. If they say "we use AI to optimise customer journeys" don't write that back, write what we actually understand they do.
- For oneLineDescription, write what the company does today, not what they aspire to.
- For sector, pick the most accurate category. Don't invent.
- For stage, infer from the document: no product = idea, has product but no paying customers = pre-revenue, has paying customers but small = early revenue, has solid revenue = revenue, growing fast = scaling.
- For traction, only include what's explicitly stated. Don't invent numbers or customers.
- If a field is unclear, make your best inference rather than leaving empty. Use empty string only if truly nothing relevant.
- Use British English (organising not organizing).
- No em dashes anywhere in any output.`;

async function extractFromText(rawText: string) {
  const trimmed = rawText.slice(0, 12000);

  const msg = await anthropic.messages.create({
    model: HAIKU,
    max_tokens: 1024,
    system: EXTRACT_PROMPT,
    messages: [{ role: "user", content: trimmed }],
  });

  const textBlock = msg.content.find(function (b) { return b.type === "text"; });
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from AI");
  }

  let cleaned = textBlock.text.trim();
  cleaned = cleaned.replace(/```json|```/g, "").trim();

  const data = JSON.parse(cleaned);

  function scrubDashes(value: any): any {
    if (typeof value === "string") {
      return value
        .replace(/[—–―−‒]/g, ", ")
        .replace(/\s+-\s+/g, ", ")
        .replace(/,\s*,/g, ",")
        .replace(/\s+/g, " ")
        .trim();
    }
    if (Array.isArray(value)) {
      return value.map(scrubDashes);
    }
    if (value && typeof value === "object") {
      const out: any = {};
      for (const k in value) {
        out[k] = scrubDashes(value[k]);
      }
      return out;
    }
    return value;
  }

  const cleanData = scrubDashes(data);
  return {
    ...cleanData,
    rawText: trimmed,
  };
}

async function tryParsePdf(buffer: Buffer): Promise<string> {
  try {
    const pdfParse = (await import("pdf-parse")).default;
    const parsed = await pdfParse(buffer, { max: 10 });
    return parsed.text || "";
  } catch (e: any) {
    const errorMsg = e?.message || "";
    const isImageError =
      errorMsg.includes("image") ||
      errorMsg.includes("XObject") ||
      errorMsg.includes("JPEG") ||
      errorMsg.includes("JBIG2") ||
      errorMsg.includes("CCITTFax") ||
      errorMsg.includes("colour") ||
      errorMsg.includes("color");

    if (isImageError) {
      try {
        const pdfParse = (await import("pdf-parse")).default;
        const parsed = await pdfParse(buffer, {
          max: 10,
          pagerender: function () { return Promise.resolve(""); },
        });
        return parsed.text || "";
      } catch (e2) {
        throw new Error("Could not extract text from this PDF. It may be image-based or designed in a tool like Canva. Please paste the text directly.");
      }
    }

    throw new Error("Could not read this PDF. Please try a different file or paste the text directly.");
  }
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

      try {
        rawText = await tryParsePdf(buffer);
      } catch (e: any) {
        return NextResponse.json(
          { ok: false, error: e?.message || "Could not read this PDF. Please paste the text directly." },
          { status: 400 }
        );
      }
    }

    if (!rawText || rawText.trim().length < 200) {
      const len = rawText ? rawText.trim().length : 0;
      const reason = len === 0
        ? "We couldn't find any text in this document. It may be image-based or designed in a tool like Canva."
        : "We could only find a small amount of text in this document, which suggests it might be mostly image-based.";
      return NextResponse.json(
        {
          ok: false,
          error: reason + " Please copy the text from your one-pager and paste it instead.",
        },
        { status: 400 }
      );
    }

    const data = await extractFromText(rawText);
    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    console.error("extract-pitch error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to extract pitch information" },
      { status: 500 }
    );
  }
}
