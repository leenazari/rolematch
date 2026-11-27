import { pitchStorageClient, PITCH_PDF_BUCKET } from "@/lib/pitch-storage";
import { tokenHash, validReportAccess } from "@/lib/pitch-access";
import { validPitchEmail } from "@/lib/pitch-session-state";
export { validPitchEmail } from "@/lib/pitch-session-state";

type Report = { id: string; company_name: string; pdf_path: string | null; access_token_hash?: string };
type Delivery = { id: string; report_id: string; recipient_role: "owner" | "participant"; recipient_email: string;
  status: string; attempts: number; updated_at: string };
export function pitchEmailEnabled() {
  return process.env.PITCH_REPORT_EMAIL_ENABLED === "true" && !!process.env.RESEND_API_KEY;
}
export function pitchEmailMessage(companyName: string, role: "owner" | "participant") {
  const company = companyName.replace(/[\r\n]/g, " ").slice(0, 160);
  return { subject: `${role === "owner" ? "Pitch Perfect report" : "Your Pitch Perfect report"}: ${company}`,
    text: role === "owner" ? `A Pitch Perfect report for ${company} is ready. The PDF is attached.\n\nPitch Perfect`
      : `Thanks for completing your pitch for ${company}. Your full Pitch Perfect report is attached.\n\nPitch Perfect` };
}
async function enqueue(reportId: string, role: "owner" | "participant", email: string) {
  const db = pitchStorageClient();
  const address = email.trim().toLowerCase();
  if (!validPitchEmail(address)) throw new Error("Please enter a valid email address.");
  const { data, error } = await db.from("pitch_email_outbox").insert({ report_id: reportId,
    recipient_role: role, recipient_email: address, status: pitchEmailEnabled() ? "pending" : "awaiting_configuration",
  }).select("*").single();
  if (!error) return data as Delivery;
  if (error.code !== "23505") throw new Error("Your email request could not be saved. Please try again.");
  const existing = await db.from("pitch_email_outbox").select("*").eq("report_id", reportId).eq("recipient_role", role).single();
  if (existing.error || !existing.data) throw new Error("Your email request could not be loaded. Please try again.");
  if (existing.data.recipient_email !== address) throw new Error("An email copy has already been requested for this report. Check the original address or download the PDF.");
  return existing.data as Delivery;
}
async function deliver(report: Report, delivery: Delivery): Promise<"sent" | "queued"> {
  if (delivery.status === "sent" || !pitchEmailEnabled() || !report.pdf_path) return delivery.status === "sent" ? "sent" : "queued";
  if (delivery.status === "sending" && Date.now() - Date.parse(delivery.updated_at) < 300_000) return "queued";
  const db = pitchStorageClient();
  const { data, error } = await db.from("pitch_email_outbox").update({ status: "sending", attempts: delivery.attempts + 1,
    updated_at: new Date().toISOString(), last_error: null,
  }).eq("id", delivery.id).eq("status", delivery.status).eq("updated_at", delivery.updated_at).select("*").maybeSingle();
  if (error) throw new Error("Email delivery could not start. Please retry.");
  if (!data) return "queued";
  try {
    const { data: blob, error: downloadError } = await db.storage.from(PITCH_PDF_BUCKET).download(report.pdf_path);
    if (downloadError || !blob) throw new Error("Saved PDF temporarily unavailable.");
    const message = pitchEmailMessage(report.company_name, delivery.recipient_role);
    const response = await fetch("https://api.resend.com/emails", { method: "POST", signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json",
        "Idempotency-Key": `pitch-perfect/${report.id}/${delivery.recipient_role}` },
      body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL || "outreach@voicereach.co.uk", to: [delivery.recipient_email],
        ...message, attachments: [{ filename: `PitchPerfect_${report.company_name.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 80)}.pdf`,
          content: Buffer.from(await blob.arrayBuffer()).toString("base64") }] }),
    });
    const result = await response.json();
    if (!response.ok || typeof result.id !== "string") throw new Error("The mail service did not accept the email. Please retry.");
    const { error: saveError } = await db.from("pitch_email_outbox").update({ status: "sent", provider_message_id: result.id,
      sent_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", delivery.id).eq("status", "sending");
    if (saveError) throw new Error("Email delivery confirmation could not be saved.");
    return "sent";
  } catch (error) {
    await db.from("pitch_email_outbox").update({ status: "failed", last_error: "Delivery interrupted. Retry uses the same delivery identifier.",
      updated_at: new Date().toISOString(),
    }).eq("id", delivery.id).eq("status", "sending");
    throw new Error("Your email request is saved, but delivery needs a retry. Your PDF remains available.");
  }
}
export async function queuePitchReportEmails(reportId: string) {
  const db = pitchStorageClient();
  const { data, error } = await db.from("pitch_reports").select("id,company_name,pdf_path,access_token_hash").eq("id", reportId).single();
  if (error || !data?.pdf_path) throw new Error("Saved report is not ready for email.");
  const address = process.env.PITCH_REPORT_OWNER_EMAIL || process.env.ADMIN_EMAIL || "lee.nazari@gmail.com";
  // A matching ID alone is not authorization: only the same session capability
  // may supply the opted-in participant address for this report.
  const session = await db.from("pitch_sessions").select("state").eq("id", reportId)
    .eq("access_token_hash", data.access_token_hash).maybeSingle();
  if (session.error) throw new Error("The participant email preference could not be loaded. Please retry.");
  const requests = [enqueue(reportId, "owner", address).then(delivery => deliver(data, delivery))];
  const recipient = session.data?.state?.recipientEmail?.trim();
  if (validPitchEmail(recipient)) requests.push(enqueue(reportId, "participant", recipient).then(delivery => deliver(data, delivery)));
  const deliveries = await Promise.allSettled(requests);
  if (deliveries.some(result => result.status === "rejected")) throw new Error("Some PDF emails need a retry. Saved reports are unaffected.");
  return deliveries;
}
export async function emailPitchReport(reportId: string, accessToken: string, email: string) {
  if (!validReportAccess(reportId, accessToken) || !validPitchEmail(email)) throw new Error("Please check your report and email address.");
  const { data, error } = await pitchStorageClient().from("pitch_reports").select("id,company_name,pdf_path")
    .eq("id", reportId).eq("access_token_hash", tokenHash(accessToken)).maybeSingle();
  if (error || !data) throw new Error("Saved report not found.");
  if (!data.pdf_path) throw new Error("Your PDF is still preparing. Please try again when it is ready.");
  return deliver(data, await enqueue(reportId, "participant", email));
}
