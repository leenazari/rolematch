import { NextRequest, NextResponse } from "next/server";
import { emailPitchReport } from "@/lib/pitch-report-email";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(req: NextRequest) {
  try {
    const origin = req.headers.get("origin");
    if (origin && origin !== new URL(req.url).origin) return NextResponse.json({ ok: false, error: "Invalid request origin." }, { status: 403 });
    const body = await req.json();
    const status = await emailPitchReport(body.reportId, body.accessToken, body.email);
    return NextResponse.json({ ok: true, status }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Your email request could not be saved. Please retry." },
      { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
