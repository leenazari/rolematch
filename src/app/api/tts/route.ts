
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const VOICE_ID = "bDTlr4ICxntY9qVWyL0o";
const MODEL_ID = "eleven_turbo_v2_5";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const text: string = (body.text || "").trim();

    if (!text) {
      return new Response(JSON.stringify({ ok: false, error: "Missing text" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!process.env.ELEVENLABS_API_KEY) {
      return new Response(JSON.stringify({ ok: false, error: "ElevenLabs API key not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const elevenUrl = "https://api.elevenlabs.io/v1/text-to-speech/" + VOICE_ID + "/stream";

    const elevenRes = await fetch(elevenUrl, {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        },
        output_format: "mp3_44100_128",
      }),
    });

    if (!elevenRes.ok) {
      const errorText = await elevenRes.text();
      console.error("ElevenLabs error:", elevenRes.status, errorText);
      return new Response(
        JSON.stringify({ ok: false, error: "TTS service error: " + elevenRes.status }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!elevenRes.body) {
      return new Response(JSON.stringify({ ok: false, error: "No audio stream" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(elevenRes.body, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-cache",
      },
    });
  } catch (e: any) {
    console.error("tts route error:", e);
    return new Response(
      JSON.stringify({ ok: false, error: e?.message || "TTS failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
