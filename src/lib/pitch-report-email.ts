import { PublicError } from "@/lib/public-error";
import "server-only";
import { pitchStorageClient, PITCH_PDF_BUCKET } from "@/lib/pitch-storage";

type Report = { id: string; company_name: string; pdf_path: string | null };
type Delivery = { id: string; report_id: string; recipient_role: "owner"; recipient_email: string;
  status: string; attempts: number; updated_at: string };
export function pitchEmailEnabled() {
  return process.env.PITCH_REPORT_EMAIL_ENABLED === "true" && !!process.env.RESEND_API_KEY;
}
function pitchEmailMessage(companyName: string) {
  const company = companyName.replace(/[\r\n]/g, " ").slice(0, 160);
  return { subject: `Pitch Perfect report: ${company}`,
    text: `A Pitch Perfect report for ${company} is ready. The PDF is attached.\n\nPitch Perfect` };
}
async function enqueue(reportId: string, email: string) {
  const db = pitchStorageClient();
  const address = email.trim().toLowerCase();
  if (address.length > 254 || !/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(address)) throw new PublicError("A single owner email address is required.");
  const { data, error } = await db.from("pitch_email_outbox").insert({ report_id: reportId,
    recipient_role: "owner", recipient_email: address, status: pitchEmailEnabled() ? "pending" : "awaiting_configuration",
  }).select("*").single();
  if (!error) return data as Delivery;
  if (error.code !== "23505") throw new PublicError("Your email request could not be saved. Please try again.");
  const existing = await db.from("pitch_email_outbox").select("*").eq("report_id", reportId).eq("recipient_role", "owner").single();
  if (existing.error || !existing.data) throw new PublicError("Your email request could not be loaded. Please try again.");
  if (existing.data.recipient_email !== address) throw new PublicError("The owner address for this delivery does not match the configured owner.");
  return existing.data as Delivery;
}
async function deliver(report: Report, delivery: Delivery): Promise<"sent" | "queued"> {
  if (delivery.status === "sent" || !pitchEmailEnabled() || !report.pdf_path) return delivery.status === "sent" ? "sent" : "queued";
  if (delivery.status === "sending" && Date.now() - Date.parse(delivery.updated_at) < 300_000) return "queued";
  const db = pitchStorageClient();
  const { data, error } = await db.from("pitch_email_outbox").update({ status: "sending", attempts: delivery.attempts + 1,
    updated_at: new Date().toISOString(), last_error: null,
  }).eq("id", delivery.id).eq("status", delivery.status).eq("updated_at", delivery.updated_at).select("*").maybeSingle();
  if (error) throw new PublicError("Email delivery could not start. Please retry.");
  if (!data) return "queued";
  try {
    const { data: blob, error: downloadError } = await db.storage.from(PITCH_PDF_BUCKET).download(report.pdf_path);
    if (downloadError || !blob) throw new PublicError("Saved PDF temporarily unavailable.");
    const message = pitchEmailMessage(report.company_name);
    const response = await fetch("https://api.resend.com/emails", { method: "POST", signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json",
        "Idempotency-Key": `pitch-perfect/${report.id}/owner` },
      body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL || "outreach@voicereach.co.uk", to: [delivery.recipient_email],
        ...message, attachments: [{ filename: `PitchPerfect_${report.company_name.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 80)}.pdf`,
          content: Buffer.from(await blob.arrayBuffer()).toString("base64") }] }),
    });
    const result = await response.json();
    if (!response.ok || typeof result.id !== "string") throw new PublicError("The mail service did not accept the email. Please retry.");
    const { error: saveError } = await db.from("pitch_email_outbox").update({ status: "sent", provider_message_id: result.id,
      sent_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", delivery.id).eq("status", "sending");
    if (saveError) throw new PublicError("Email delivery confirmation could not be saved.");
    return "sent";
  } catch (error) {
    await db.from("pitch_email_outbox").update({ status: "failed", last_error: "Delivery interrupted. Retry uses the same delivery identifier.",
      updated_at: new Date().toISOString(),
    }).eq("id", delivery.id).eq("status", "sending");
    throw new PublicError("Your email request is saved, but delivery needs a retry. Your PDF remains available.");
  }
}
export async function queueOwnerPitchEmail(reportId: string) {
  const db = pitchStorageClient();
  const { data, error } = await db.from("pitch_reports").select("id,company_name,pdf_path").eq("id", reportId).single();
  if (error || !data?.pdf_path) throw new PublicError("Saved report is not ready for email.");
  const address = process.env.PITCH_REPORT_OWNER_EMAIL || process.env.ADMIN_EMAIL || "lee.nazari@gmail.com";
  return deliver(data, await enqueue(reportId, address));
}
