import { readPdfText } from "@/lib/pdf-text";
import { checkRequest, checkUsage } from "@/lib/api-guard";
import { PublicError, safeFailure } from "@/lib/public-error";
import { NextRequest, NextResponse } from "next/server";
import { generateJson } from "@/lib/openai-json";

export const runtime = "nodejs";
export const maxDuration = 30;

const EXTRACT_PROMPT = `You extract structured data from CV text. Respond with ONLY valid JSON. No preamble. No code fences. No em dashes anywhere in any value.

Return this exact shape:
{
  "name": "string",
  "currentRole": "string (most recent or current job title)",
  "sector": "string (industry, e.g. Retail, Healthcare, Tech, Education)",
  "yearsExperience": number (total years of professional work),
  "keySkills": ["string", "string", ...] (8-12 items),
  "education": "string (highest qualification, brief)",
  "notableEmployers": ["string", "string", ...] (up to 5 employer names)
}

Rules for keySkills:
- Infer skills from what they have actually done, not just words they wrote about themselves.
- Mix hard skills (tools, software, technical capabilities, languages, certifications) with practical capabilities demonstrated by their roles (e.g. team leadership, stakeholder management, P&L responsibility, customer service at scale, project delivery, training others, conflict resolution).
- Avoid generic adjectives like "hardworking", "passionate", "motivated", "team player". Those tell us nothing.
- Avoid duplicates and near-duplicates.
- Use British English spelling (organising not organizing).
- If a skill is implied by a job (e.g. a shop floor manager has people management, rota planning, cash handling, customer complaints, stock control), include the implied skill.

If a field is unclear, make your best inference rather than leaving it empty. Use empty array if truly nothing found.`;

async function extractFromText(rawText: string) {
  const trimmed = rawText.slice(0, 12000);

  const data = await generateJson("cv_extract", EXTRACT_PROMPT, trimmed);
  return {
    ...data,
    rawText: trimmed,
    lovedSkills: [],
    avoidSkills: [],
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
        rawText = await readPdfText(file, 50);
      } catch (e: any) {
        return safeFailure(e, "Could not read this PDF. Please paste the text directly.", 400);
      }
    }

    // Tighter threshold: 200 chars catches image-only CVs that produce minimal extracted text
    // (header text, logo alt text, etc.) while letting genuine short CVs through.
    if (!rawText || rawText.trim().length < 200) {
      const len = rawText ? rawText.trim().length : 0;
      const reason = len === 0
        ? "We couldn't find any text in this PDF. It may be image-based (scanned or from Canva) where the CV is rendered as a picture rather than text."
        : "We could only find a small amount of text in this PDF, which suggests it might be mostly image-based.";
      return NextResponse.json(
        {
          ok: false,
          error: reason + " Please copy the text from your CV and paste it instead.",
        },
        { status: 400 }
      );
    }

    await checkUsage(req, "upload");
    const data = await extractFromText(rawText);
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return safeFailure(error, "Could not read this CV. Please paste the text or try again.");
  }
}
