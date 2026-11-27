import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { loadPitchSession, savePitchSession } from "@/lib/pitch-session";
import { RESULTS_PROMPT, pitchReportInput } from "@/lib/pitch-report-prompt";
import { runPitchReportJob } from "@/lib/pitch-report-job";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(req: NextRequest) {
  try {
    const origin = req.headers.get("origin");
    if (origin && origin !== new URL(req.url).origin) return NextResponse.json({ ok: false, error: "Invalid request origin." }, { status: 403 });
    if (Number(req.headers.get("content-length")) > 900_000) return NextResponse.json({ ok: false, error: "Pitch session is too large." }, { status: 413 });
    const body = await req.json();
    if (body.action === "load") return NextResponse.json({ ok: true, session: await loadPitchSession(body.reportId, body.accessToken) }, { headers: { "Cache-Control": "no-store" } });
    if (body.action !== "save") return NextResponse.json({ ok: false, error: "Invalid session action." }, { status: 400 });
    const saved = await savePitchSession(body.reportId, body.accessToken, body.state);
    if (saved.completedNow) {
      const state = saved.session.state;
      // The report continues after this save returns, even if the browser closes.
      // The results page uses the same report ID, so it cannot create a second job.
      waitUntil(runPitchReportJob({ id: body.reportId, accessToken: body.accessToken,
        pitchData: state.pitchData, conversation: state.messages, instructions: RESULTS_PROMPT,
        input: pitchReportInput(state.pitchData, state.messages), split: true, twoChunks: true,
      }).catch(error => console.error("pitch-session report start failed", { name: error?.name })));
    }
    return NextResponse.json({ ok: true, session: saved.session }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("pitch-session failed", { name: (error as Error)?.name });
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Your pitch could not be saved. Please retry." },
      { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
