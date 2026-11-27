import { NextRequest, NextResponse } from "next/server";
import { RESULTS_PROMPT, pitchReportInput } from "@/lib/pitch-report-prompt";
import { runPitchReportJob, validReportAccess } from "@/lib/pitch-report-job";
import type { PitchData, PitchMessage, PitchCritique } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 300;

type Body = {
  pitchData?: PitchData;
  conversation?: PitchMessage[];
  reportId: string;
  accessToken: string;
  retry?: boolean;
  existingCritique?: PitchCritique;
  generatedAt?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body: Body = await req.json();
    const { pitchData, conversation, reportId, accessToken, retry } = body;
    if (!validReportAccess(reportId, accessToken)) {
      return NextResponse.json({ ok: false, code: "REPORT_PAGE_OUTDATED",
        error: "Refresh this page to reconnect your saved pitch, then try again. Your conversation is still saved." },
        { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    const origin = req.headers?.get("origin");
    if (origin && req.url && origin !== new URL(req.url).origin) {
      return NextResponse.json({ ok: false, error: "Invalid request origin." }, { status: 403 });
    }
    if (!pitchData || !Array.isArray(conversation)) {
      const result = await runPitchReportJob({ id: reportId, accessToken, retry });
      return NextResponse.json(result, { status: result.status === "processing" ? 202 : 200, headers: { "Cache-Control": "no-store" } });
    }

    const userPrompt = pitchReportInput(pitchData, conversation);

    const result = await runPitchReportJob({ id: reportId, accessToken, pitchData, conversation,
      instructions: RESULTS_PROMPT, input: userPrompt, retry, existingCritique: body.existingCritique, generatedAt: body.generatedAt, split: true, twoChunks: true });
    return NextResponse.json(result, { status: result.status === "processing" ? 202 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    console.error("generate-pitch-results error:", { name: e?.name, status: e?.status, code: e?.code });
    return NextResponse.json(
      { ok: false, error: e?.status ? "Report generation is temporarily unavailable. Please try again." : e?.message || "Failed to generate results" },
      { status: 500 }
    );
  }
}
