import { checkUsage } from "@/lib/api-guard";
import { safeFailure } from "@/lib/public-error";
import { NextRequest, NextResponse } from "next/server";
import { voiceAudio } from "@/lib/openai-voice";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return NextResponse.json({ ok: false }, { status: 403 });
  if (Number(req.headers.get("content-length")) > 24_000) return NextResponse.json({ ok: false }, { status: 413 });
  const body = await req.json().catch(() => null);
  const script = typeof body?.text === "string" ? body.text.trim() : "";
  if (!script || script.length > 3000) return NextResponse.json({ ok: false, error: "Invalid speech text." }, { status: 400 });
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ ok: false, error: "Voice playback is unavailable." }, { status: 503 });
  try {
    await checkUsage(req, "audio");
    const audio = await voiceAudio(script, body.persona === "investor" ? "investor" : "career", req.signal);
    return new Response(audio, { headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" } });
  } catch (error) {
    return safeFailure(error, "Voice playback is unavailable.", 502);
  }
}
