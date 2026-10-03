import { NextRequest, NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";

export const runtime = "nodejs";
export const maxDuration = 60;
const MAX_AUDIO_BYTES = 3_500_000;
const formats: Record<string, string> = {
  "audio/webm": "webm", "video/webm": "webm", "audio/mp4": "mp4",
  "video/mp4": "mp4", "audio/wav": "wav", "audio/x-wav": "wav", "audio/mpeg": "mp3",
};

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ ok: false, error: "Invalid request origin." }, { status: 403 });
  }
  if (Number(request.headers.get("content-length")) > MAX_AUDIO_BYTES + 8192) {
    return NextResponse.json({ ok: false, error: "Record a shorter answer, up to three minutes." }, { status: 413 });
  }
  try {
    const form = await request.formData();
    const audio = form.get("audio");
    if (!audio || typeof audio === "string" || !audio.size) {
      return NextResponse.json({ ok: false, error: "No audio was captured. Try again or type your answer." }, { status: 400 });
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ ok: false, error: "Record a shorter answer, up to three minutes." }, { status: 413 });
    }
    const mime = audio.type.split(";")[0].toLowerCase();
    const extension = formats[mime];
    if (!extension) {
      return NextResponse.json({ ok: false, error: "This audio format is not supported. Try another browser or type your answer." }, { status: 415 });
    }
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ ok: false, error: "Voice transcription is unavailable. Please type your answer." }, { status: 503 });
    }
    const companyName = String(form.get("companyName") || "").slice(0, 150);
    const openai = new OpenAI({ timeout: 45_000, maxRetries: 0 });
    const result = await openai.audio.transcriptions.create({
      file: await toFile(Buffer.from(await audio.arrayBuffer()), "answer." + extension, { type: mime }),
      model: process.env.OPENAI_PITCH_TRANSCRIPTION_MODEL || "gpt-4o-transcribe",
      language: "en",
      prompt: "An investor pitch in British English. Business vocabulary: revenue, EPOS, SaaS, payments." +
        (companyName ? " Company name: " + companyName + "." : ""),
    });
    const text = result.text.trim();
    if (!text) {
      return NextResponse.json({ ok: false, error: "No speech was detected. Record again or type your answer." }, { status: 422 });
    }
    return NextResponse.json({ ok: true, text });
  } catch (cause) {
    const error = cause as { status?: number; code?: string; name?: string };
    console.error("pitch-audio transcription failed", { status: error.status, code: error.code, name: error.name });
    return NextResponse.json({ ok: false, error: "Could not transcribe your answer. Retry the recording or type your answer." }, { status: 502 });
  }
}
