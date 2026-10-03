import { NextRequest } from "next/server";
import { downloadSavedPitchPdf, validReportAccess } from "@/lib/pitch-report-job";
import { renderPitchPdf } from "@/lib/pitch-pdf";
import type { PitchData, PitchCritique } from "@/types";
export const runtime = "nodejs";
export const maxDuration = 30;
type Body = { pitchData?: PitchData; critique?: PitchCritique; generatedAt?: string; reportId?: string; accessToken?: string };

export async function POST(req: NextRequest) {
  try {
    const body: Body = await req.json();
    const { pitchData, critique, generatedAt, reportId, accessToken } = body;
    if (reportId || accessToken) {
      if (!validReportAccess(reportId, accessToken)) return new Response("Invalid report access.", { status: 400 });
      const saved = await downloadSavedPitchPdf(reportId!, accessToken!);
      const safeName = saved.companyName.replace(/[^a-zA-Z0-9]+/g, "_");
      return new Response(saved.pdf, { headers: { "Content-Type": "application/pdf", "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="PitchPerfect_${safeName}.pdf"` } });
    }

    if (!pitchData || !critique) {
      return new Response(JSON.stringify({ ok: false, error: "Missing required fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const pdfBuffer = await renderPitchPdf(pitchData, critique, generatedAt || "");

    const safeName = pitchData.companyName.replace(/[^a-zA-Z0-9]+/g, "_");

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=\"PitchPerfect_" + safeName + ".pdf\"",
      },
    });
  } catch (e: any) {
    console.error("generate-pitch-pdf error:", e);
    return new Response(
      JSON.stringify({ ok: false, error: e?.message || "Failed to generate PDF" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
