// Old open tabs receive a clear answer without collecting an address or contacting a mailer.
export async function POST() {
  return Response.json({ ok: false, error: "Reports are download-only. Download your PDF from the open results page." },
    { status: 410, headers: { "Cache-Control": "private, no-store" } });
}
