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
  return {
    ...data,
    rawText: trimmed,
    lovedSkills: [],
    avoidSkills: [],
  };
}

async function tryParsePdf(buffer: Buffer): Promise<string> {
  // Try parsing the PDF with image errors swallowed.
  // pdf-parse can throw on certain embedded images, malformed XObjects, or unusual encodings.
  // We want to return whatever text we can extract, even if image parsing fails.
  try {
    const pdfParse = (await import("pdf-parse")).default;
    // Pass options that tell pdf-parse to be more tolerant.
    // The "max" option limits pages parsed; we keep it generous.
    // Some pdf-parse errors come from internal pdfjs warnings about images we don't care about.
    const parsed = await pdfParse(buffer, { max: 50 });
    return parsed.text || "";
  } catch (e: any) {
    // If pdf-parse threw, try one more time with a manual fallback approach
    // by ignoring known image-related error patterns
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
      // Image-related parse failure. Try a more aggressive read that skips problematic content.
      try {
        const pdfParse = (await import("pdf-parse")).default;
        const parsed = await pdfParse(buffer, {
          max: 50,
          pagerender: function () { return Promise.resolve(""); },
        });
        return parsed.text || "";
      } catch (e2) {
        // Both attempts failed. Throw a friendlier error.
        throw new Error("Could not extract text from this PDF. It may be image-based or have unusual formatting. Please paste the text directly.");
      }
    }

    // Non-image error, re-throw with friendlier message
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
