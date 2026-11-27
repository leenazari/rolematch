import { checkRequest, checkUsage } from "@/lib/api-guard";
import { safeFailure } from "@/lib/public-error";
import { NextRequest, NextResponse } from "next/server";
import { emailPitchReport } from "@/lib/pitch-report-email";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(req: NextRequest) {
  try {
    checkRequest(req, 4096);
    const body = await req.json();
    await checkUsage(req, "email");
    const status = await emailPitchReport(body.reportId, body.accessToken, body.email);
    return NextResponse.json({ ok: true, status }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return safeFailure(error, "Your email request could not be saved. Please retry.", 400);
  }
}
