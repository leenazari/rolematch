import { createHash } from "node:crypto";
import { waitUntil } from "@vercel/functions";
import { beginPitchReport, consumePitchReportStream, retrievePitchReport, readPitchReportStream, parsePitchReport, isPitchCritique } from "@/lib/pitch-report";
import { parsePartialPitchReport } from "@/lib/pitch-report-progress";
import { pitchStorageClient, savePitchPdf, PITCH_PDF_BUCKET } from "@/lib/pitch-storage";
import { renderPitchPdf } from "@/lib/pitch-pdf";
import type { PitchData, PitchMessage, PitchCritique } from "@/types";

type Job = {
  id: string; access_token_hash: string; pitch_data: PitchData; conversation: PitchMessage[];
  report_input: string; report_instructions: string; model: string; response_id: string | null;
  status: "starting" | "processing" | "ready" | "failed";
  critique: PitchCritique | null; pdf_path: string | null; generated_at: string | null; updated_at: string;
  streaming: boolean; stream_cursor: number; stream_text: string; partial_critique: Partial<PitchCritique> | null;
};
type Request = { id: string; accessToken: string; pitchData?: PitchData; conversation?: PitchMessage[];
  instructions?: string; input?: string; retry?: boolean; existingCritique?: PitchCritique; generatedAt?: string };

export function validReportAccess(id: unknown, token: unknown): boolean {
  return typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) &&
    typeof token === "string" && /^[0-9a-f]{64}$/i.test(token);
}
function tokenHash(token: string) { return createHash("sha256").update(token).digest("hex"); }
const pending = { ok: true, status: "processing" };

async function findJob(id: string, accessToken: string): Promise<Job | null> {
  const { data, error } = await pitchStorageClient().from("pitch_reports").select("*")
    .eq("id", id).eq("access_token_hash", tokenHash(accessToken)).maybeSingle();
  if (error) throw new Error("Saved reports are temporarily unavailable. Please try again.");
  return data;
}
async function updateJob(id: string, fields: Record<string, unknown>) {
  const { error } = await pitchStorageClient().from("pitch_reports").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error("The report could not be saved yet. Please try again.");
}

async function startJob(job: Job) {
  let started: Awaited<ReturnType<typeof beginPitchReport>> | undefined;
  try {
    const response = started = await beginPitchReport(job.report_instructions, job.report_input, job.model);
    await updateJob(job.id, { response_id: response.id, status: "processing", streaming: response.streaming === true,
      stream_cursor: response.streamCursor ?? -1, stream_text: "", partial_critique: null });
    if (response.iterator) waitUntil(continueJob(job, response));
    return pending;
  } catch (error) {
    started?.controller?.abort();
    console.error("pitch-report start failed", { name: (error as Error).name });
    await updateJob(job.id, { status: "failed" });
    throw new Error("The report could not start. Please try generating it again.");
  }
}

async function continueJob(job: Job, started: Awaited<ReturnType<typeof beginPitchReport>>) {
  try {
    await consumePitchReportStream(started, async checkpoint => {
      // A resumed reader may have advanced further. Never replace newer progress.
      const { error } = await pitchStorageClient().from("pitch_reports").update({
        stream_cursor: checkpoint.cursor, stream_text: checkpoint.text,
        partial_critique: parsePartialPitchReport(checkpoint.text), updated_at: new Date().toISOString(),
      }).eq("id", job.id).eq("response_id", started.id).lt("stream_cursor", checkpoint.cursor)
        .eq("status", "processing").is("critique", null);
      if (error) throw new Error("Report progress could not be saved.");
    });
    const response = await retrievePitchReport(started.id);
    if (response.status !== "queued" && response.status !== "in_progress") await finishReport({ ...job, response_id: started.id }, response);
  } catch (error) {
    // A transport interruption leaves the same stored response available to polls.
    console.error("pitch-report stream interrupted", { name: (error as Error).name });
  }
}

async function reportProgress(job: Job, accessToken: string) {
  if (!job.streaming) return { ...pending, partial: job.partial_critique || undefined };
  // The original stream is checkpointed by the background worker. Only resume it
  // when progress is stale, avoiding a second connection on every UI poll.
  if (Date.now() - new Date(job.updated_at).getTime() < 15_000) {
    return { ...pending, partial: job.partial_critique || undefined };
  }
  const checkpoint = await readPitchReportStream(job.response_id!, job.stream_cursor, job.stream_text);
  let current = job;
  if (checkpoint.cursor > job.stream_cursor) {
    const partial = parsePartialPitchReport(checkpoint.text);
    // Competing polls may replay the same events. Only one can advance this checkpoint.
    const { data, error } = await pitchStorageClient().from("pitch_reports").update({
      stream_cursor: checkpoint.cursor, stream_text: checkpoint.text, partial_critique: partial,
      updated_at: new Date().toISOString(),
    }).eq("id", job.id).eq("response_id", job.response_id).eq("stream_cursor", job.stream_cursor)
      .eq("status", "processing").is("critique", null).select("*").maybeSingle();
    if (error) throw new Error("Your feedback could not be saved yet. Please try again to resume it.");
    current = data || await findJob(job.id, accessToken) || job;
  }
  if (current.critique) return completeJob(current);
  return { ...pending, partial: current.partial_critique || undefined };
}

async function finishReport(job: Job, response: Awaited<ReturnType<typeof retrievePitchReport>>) {
  let critique: PitchCritique;
  try { critique = parsePitchReport(response); }
  catch {
    const { error } = await pitchStorageClient().from("pitch_reports").update({ status: "failed" })
      .eq("id", job.id).eq("response_id", job.response_id).eq("status", "processing").is("critique", null);
    if (error) throw new Error("Saved reports are temporarily unavailable. Please try again.");
    throw new Error("The report could not be completed. Please try generating it again.");
  }
  const generatedAt = new Date().toISOString();
  // The worker and a poll can finish together. Only the first may archive this
  // response; every reader must use that same critique and source-check timestamp.
  const { data, error } = await pitchStorageClient().from("pitch_reports").update({
    critique, generated_at: generatedAt, token_usage: response.usage || null, updated_at: generatedAt,
  }).eq("id", job.id).eq("response_id", job.response_id).eq("status", "processing")
    .is("critique", null).select("*").maybeSingle();
  if (error) throw new Error("The report could not be saved yet. Please try again.");
  let saved = data as Job | null;
  if (!saved) {
    const result = await pitchStorageClient().from("pitch_reports").select("*")
      .eq("id", job.id).eq("response_id", job.response_id).maybeSingle();
    if (result.error) throw new Error("Saved reports are temporarily unavailable. Please try again.");
    saved = result.data;
  }
  if (!saved?.critique) return pending;
  return completeJob(saved);
}

async function completeJob(job: Job) {
  try {
    const path = job.pdf_path || `${job.id}/PitchPerfect_${job.pitch_data.companyName.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 80)}.pdf`;
    if (!job.pdf_path) {
      const pdf = await renderPitchPdf(job.pitch_data, job.critique!, job.generated_at!);
      await savePitchPdf(path, pdf);
      await updateJob(job.id, { status: "ready", pdf_path: path });
    }
    return { ok: true, status: "completed", data: job.critique, generatedAt: job.generated_at, pdfSaved: true, reportId: job.id };
  } catch (error) {
    console.error("pitch-report PDF saving failed", { name: (error as Error).name });
    // The critique is already durable. Retrying this job only retries the PDF, never the paid AI generation.
    return { ok: true, status: "completed", data: job.critique, generatedAt: job.generated_at,
      pdfSaved: false, reportId: job.id, saveWarning: "Your report is ready, but its PDF copy has not saved yet. Please retry saving." };
  }
}

export async function runPitchReportJob(request: Request) {
  if (!validReportAccess(request.id, request.accessToken)) throw new Error("Invalid report access.");
  if (request.existingCritique && !isPitchCritique(request.existingCritique)) throw new Error("Invalid saved report.");
  let job = await findJob(request.id, request.accessToken);
  if (!job) {
    if (!request.pitchData || !Array.isArray(request.conversation) || !request.instructions || !request.input) {
      throw new Error("Report not found.");
    }
    const { data, error } = await pitchStorageClient().from("pitch_reports").insert({
      id: request.id, access_token_hash: tokenHash(request.accessToken), company_name: request.pitchData.companyName,
      pitch_data: request.pitchData, conversation: request.conversation, report_instructions: request.instructions,
      report_input: request.input, model: request.existingCritique ? "previously_generated" : process.env.OPENAI_PITCH_REPORT_MODEL || "gpt-6.1-sol",
      status: request.existingCritique ? "processing" : "starting", critique: request.existingCritique || null,
      generated_at: request.existingCritique ? (request.generatedAt && !isNaN(Date.parse(request.generatedAt))
        ? new Date(request.generatedAt).toISOString() : new Date().toISOString()) : null,
    }).select("*").single();
    if (error) {
      if (error.code !== "23505") throw new Error("Your conversation could not be saved yet. Please try again.");
      job = await findJob(request.id, request.accessToken);
      if (!job) throw new Error("Report not found.");
    } else return data.critique ? completeJob(data) : startJob(data);
  }
  if (job.critique) return completeJob(job);
  if (job.status === "failed") {
    if (!request.retry) throw new Error("The report could not be completed. Please try generating it again.");
    // Only one concurrent retry may claim this job.
    const { data, error } = await pitchStorageClient().from("pitch_reports").update({ status: "starting",
      response_id: null, stream_cursor: -1, stream_text: "", partial_critique: null,
      updated_at: new Date().toISOString() }).eq("id", job.id).eq("status", "failed").select("*").maybeSingle();
    if (error) throw new Error("The report could not restart yet. Please try again.");
    return data ? startJob(data) : pending;
  }
  if (!job.response_id) {
    if (Date.now() - new Date(job.updated_at).getTime() > 90_000) {
      const { data, error } = await pitchStorageClient().from("pitch_reports").update({ status: "failed" })
        .eq("id", job.id).eq("status", "starting").is("response_id", null).eq("updated_at", job.updated_at).select("*").maybeSingle();
      if (error) throw new Error("Saved reports are temporarily unavailable. Please try again.");
      if (data) throw new Error("The report did not start. Please try generating it again.");
    }
    return pending;
  }
  const response = await retrievePitchReport(job.response_id);
  if (response.status === "queued" || response.status === "in_progress") return reportProgress(job, request.accessToken);
  return finishReport(job, response);
}

export async function downloadSavedPitchPdf(id: string, accessToken: string) {
  const job = await findJob(id, accessToken);
  if (!job?.pdf_path) throw new Error("Saved PDF not found.");
  const { data, error } = await pitchStorageClient().storage.from(PITCH_PDF_BUCKET).download(job.pdf_path);
  if (error || !data) throw new Error("The saved PDF could not be downloaded. Please try again.");
  return { pdf: Buffer.from(await data.arrayBuffer()), companyName: job.pitch_data.companyName };
}
