import { checkRequest } from "@/lib/api-guard";
import { tokenHash, validReportAccess } from "@/lib/pitch-access";
import { pitchStorageClient } from "@/lib/pitch-storage";
import { PublicError, safeFailure } from "@/lib/public-error";

export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    checkRequest(req, 2048);
    const { reportId, accessToken, viewToken } = await req.json();
    if (!validReportAccess(reportId, accessToken) || !validReportAccess(reportId, viewToken) || accessToken === viewToken)
      throw new PublicError("Invalid report access.", 400);
    const { data, error } = await pitchStorageClient().rpc("claim_pitch_results_view", {
      p_id: reportId, p_recovery_hash: tokenHash(accessToken), p_view_hash: tokenHash(viewToken),
    });
    if (error) throw new PublicError("The report could not be opened. Please retry.", 503);
    if (data !== true) throw new PublicError("This report is no longer available to open.", 410);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return safeFailure(e, "The report could not be opened. Please retry.");
  }
}
