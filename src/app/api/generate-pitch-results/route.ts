import { checkRequest, checkUsage } from "@/lib/api-guard";
import { safeFailure } from "@/lib/public-error";
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
    checkRequest(req, 1_100_000);
    const beforeGeneration = () => checkUsage(req, "report");
    const body: Body = await req.json();
    const { pitchData, conversation, reportId, accessToken, retry } = body;
    if (!validReportAccess(reportId, accessToken)) {
      return NextResponse.json({ ok: false, code: "REPORT_PAGE_OUTDATED",
        error: "Refresh this page to reconnect your saved pitch, then try again. Your conversation is still saved." },
        { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    if (!pitchData || !Array.isArray(conversation)) {
      const result = await runPitchReportJob({ beforeGeneration, id: reportId, accessToken, retry });
      return NextResponse.json(result, { status: result.status === "processing" ? 202 : 200, headers: { "Cache-Control": "no-store" } });
    }

    const userPrompt = pitchReportInput(pitchData, conversation);

    const result = await runPitchReportJob({ beforeGeneration, id: reportId, accessToken, pitchData, conversation,
      instructions: RESULTS_PROMPT, input: userPrompt, retry, existingCritique: body.existingCritique, generatedAt: body.generatedAt, split: true, twoChunks: true });
    return NextResponse.json(result, { status: result.status === "processing" ? 202 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return safeFailure(error, "Report generation is temporarily unavailable. Your pitch is saved. Please retry.");
  }
}
