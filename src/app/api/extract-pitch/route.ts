import { readPdfText } from "@/lib/pdf-text";
import { checkRequest, checkUsage } from "@/lib/api-guard";
import { PublicError, safeFailure } from "@/lib/public-error";
import { NextRequest, NextResponse } from "next/server";
import { generateJson } from "@/lib/openai-json";

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
  "stage": "string (one of: 'idea', 'pre-revenue', 'early revenue', 'revenue', 'scaling', 'not specified')",
  "teamSize": "string (number of full-time team members, or description like 'two co-founders' if not numeric)",
  "founderBackground": "string (brief: where they came from, 1-2 sentences)",
  "traction": "string (any concrete traction mentioned: customers, revenue, users, partnerships, pilots. If none mentioned, write 'No traction details mentioned')",
  "ask": "string (the amount they want to raise, or 'Not specified' if not mentioned. Keep their exact phrasing if specified, e.g. '£500k seed' or '£1M-£2M target')"
}

Rules:
- Be specific, not generic. If they say "we use AI to optimise customer journeys" don't write that back, write what we actually understand they do.
- For oneLineDescription, write what the company does today, not what they aspire to.
- For sector, pick the most accurate category. Don't invent.
- For stage, use evidence in the document. Use pre-revenue only when it explicitly says there are no paying customers or revenue. A list of pilots and a price is insufficient evidence either way. Use 'not specified' when the commercial stage is unclear.
- For traction, only include what's explicitly stated. Don't invent numbers or customers.
- If a field is unclear, make your best inference rather than leaving empty. Use empty string only if truly nothing relevant.
- Use British English (organising not organizing).
- No em dashes anywhere in any output.`;

async function extractFromText(rawText: string) {
  const trimmed = rawText.slice(0, 12000);

  const data = await generateJson("pitch_extract", EXTRACT_PROMPT, trimmed);

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

export async function POST(req: NextRequest) {
  try {
    checkRequest(req, 4_500_000);
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
      if (file.size > 4_500_000) throw new PublicError("This document is too large.", 413);

      try {
        rawText = await readPdfText(file, 10);
      } catch (e: any) {
        return safeFailure(e, "Could not read this PDF. Please paste the text directly.", 400);
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

    await checkUsage(req, "upload");
    const data = await extractFromText(rawText);
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return safeFailure(error, "Could not read this pitch. Please paste the text or try again.");
  }
}
