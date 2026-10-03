import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  if (Number(request.headers.get("content-length")) > 65_536) {
    return NextResponse.json({ ok: false }, { status: 413 });
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  try {
    const body = await request.json();
    if (typeof body.sdp !== "string" || !body.sdp.startsWith("v=0") || body.sdp.length > 64_000) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    const companyName = String(body.companyName || "").slice(0, 150);
    const form = new FormData();
    form.set("sdp", body.sdp);
    form.set("session", JSON.stringify({
      type: "transcription",
      audio: {
        input: {
          transcription: {
            model: "gpt-live-transcribe",
            languages: ["en"],
            delay: "low",
            prompt: "An investor pitch in British English." + (companyName ? " Company: " + companyName + "." : ""),
          },
          turn_detection: null,
        },
      },
    }));
    const response = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: { Authorization: "Bearer " + process.env.OPENAI_API_KEY },
      body: form,
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) {
      console.error("pitch-live connection rejected", { status: response.status });
      return NextResponse.json({ ok: false }, { status: 502 });
    }
    const sdp = await response.text();
    if (!sdp.startsWith("v=0")) throw new Error("Invalid session answer");
    return NextResponse.json({ ok: true, sdp }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("pitch-live connection unavailable");
    return NextResponse.json({ ok: false }, { status: 502 });
  }
}
