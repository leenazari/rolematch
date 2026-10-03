import { createHash } from "node:crypto";
import { waitUntil } from "@vercel/functions";
import { beginPitchReport, consumePitchReportStream, retrievePitchReport, readPitchReportStream, parsePitchReport,
  parsePitchMarketReport, combinePitchReportUsage, isPitchCritique } from "@/lib/pitch-report";
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
  split_report: boolean; core_critique: PitchCritique | null; core_usage: unknown;
  research_response_id: string | null; research_status: "idle" | "starting" | "processing" | "ready" | "failed";
  research_result: PitchCritique["marketResearch"] | null; research_usage: unknown;
  research_cursor: number; research_updated_at: string | null;
};
type Request = { id: string; accessToken: string; pitchData?: PitchData; conversation?: PitchMessage[];
  instructions?: string; input?: string; retry?: boolean; existingCritique?: PitchCritique; generatedAt?: string; split?: boolean };

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
    const response = started = await beginPitchReport(job.report_instructions, job.report_input, job.model, job.split_report ? "core" : "full");
    await updateJob(job.id, { response_id: response.id, status: "processing", streaming: response.streaming === true,
      stream_cursor: response.streamCursor ?? -1, stream_text: "", partial_critique: null });
    if (response.iterator) waitUntil(Promise.allSettled([
      continueJob(job, response), ...(job.split_report ? [startResearch({ ...job, response_id: response.id })] : []),
    ]));
    return pending;
  } catch (error) {
    started?.controller?.abort();
    console.error("pitch-report start failed", { name: (error as Error).name });
    await updateJob(job.id, { status: "failed" });
    throw new Error("The report could not start. Please try generating it again.");
  }
}

function splitPending(job: Job) {
  return { ...pending, partial: job.core_critique || job.partial_critique || undefined };
}

async function latestJob(job: Job): Promise<Job> {
  const { data, error } = await pitchStorageClient().from("pitch_reports").select("*")
    .eq("id", job.id).eq("response_id", job.response_id).maybeSingle();
  if (error || !data) throw new Error("Saved reports are temporarily unavailable. Please try again.");
  return data;
}

async function startResearch(job: Job, retry = false) {
  let started: Awaited<ReturnType<typeof beginPitchReport>> | undefined;
  const { data, error } = await pitchStorageClient().from("pitch_reports").update({ research_status: "starting",
    research_response_id: null, research_cursor: -1, research_updated_at: new Date().toISOString(),
  }).eq("id", job.id).eq("response_id", job.response_id).eq("research_status", retry ? "failed" : "idle")
    .is("research_result", null).select("*").maybeSingle();
  if (error) throw new Error("Market research could not start yet. Please try again.");
  if (!data) return; // Another worker or retry already owns this part.
  try {
    started = await beginPitchReport(job.report_instructions, job.report_input, job.model, "market");
    const { error: saveError } = await pitchStorageClient().from("pitch_reports").update({
      research_response_id: started.id, research_status: "processing", research_cursor: started.streamCursor,
      research_updated_at: new Date().toISOString(),
    }).eq("id", job.id).eq("response_id", job.response_id).eq("research_status", "starting");
    if (saveError) throw new Error("Market research could not be saved.");
    const researchId = started.id;
    await consumePitchReportStream(started, async checkpoint => {
      const { error: progressError } = await pitchStorageClient().from("pitch_reports").update({
        research_cursor: checkpoint.cursor, research_updated_at: new Date().toISOString(),
      }).eq("id", job.id).eq("response_id", job.response_id).eq("research_response_id", researchId)
        .eq("research_status", "processing").lt("research_cursor", checkpoint.cursor);
      if (progressError) throw new Error("Market research progress could not be saved.");
    });
    const response = await retrievePitchReport(researchId);
    if (response.status !== "queued" && response.status !== "in_progress") {
      await finishResearch({ ...job, research_response_id: researchId }, response);
    }
  } catch (error) {
    started?.controller.abort();
    console.error("pitch-report research interrupted", { name: (error as Error).name });
    // A saved response can be resumed without paying for another generation.
    // Failed creation has no response to resume, so requires an explicit retry.
    if (!started) await pitchStorageClient().from("pitch_reports").update({ research_status: "failed" })
      .eq("id", job.id).eq("response_id", job.response_id).eq("research_status", "starting");
  }
}

async function finishResearch(job: Job, response: Awaited<ReturnType<typeof retrievePitchReport>>) {
  let market: NonNullable<PitchCritique["marketResearch"]>;
  try { market = parsePitchMarketReport(response); }
  catch {
    await pitchStorageClient().from("pitch_reports").update({ research_status: "failed" })
      .eq("id", job.id).eq("research_response_id", job.research_response_id).is("research_result", null);
    throw new Error("Your pitch feedback is saved, but market research could not finish. Resume to retry just the research.");
  }
  const { error } = await pitchStorageClient().from("pitch_reports").update({ research_status: "ready",
    research_result: market, research_usage: response.usage || null, research_updated_at: new Date().toISOString(),
  }).eq("id", job.id).eq("research_response_id", job.research_response_id).is("research_result", null);
  if (error) throw new Error("Market research could not be saved yet. Please resume it.");
  return finishSplitReport(await latestJob(job));
}

async function finishSplitReport(job: Job) {
  if (job.critique) return completeJob(job);
  if (!job.core_critique || !job.research_result) return splitPending(job);
  const critique = { ...job.core_critique, marketResearch: job.research_result };
  if (!isPitchCritique(critique)) throw new Error("The combined report could not be validated. Please resume it.");
  const generatedAt = new Date().toISOString();
  const { data, error } = await pitchStorageClient().from("pitch_reports").update({ critique,
    generated_at: generatedAt, updated_at: generatedAt, token_usage: combinePitchReportUsage(job.core_usage, job.research_usage),
  }).eq("id", job.id).eq("response_id", job.response_id).eq("research_response_id", job.research_response_id)
    .eq("status", "processing").is("critique", null).select("*").maybeSingle();
  if (error) throw new Error("The complete report could not be saved yet. Please resume it.");
  const saved = data || await latestJob(job);
  return saved.critique ? completeJob(saved) : splitPending(saved);
}

async function advanceResearch(job: Job) {
  if (job.research_status === "failed") throw new Error("Your pitch feedback is saved, but market research could not finish. Resume to retry just the research.");
  if (!job.research_response_id) {
    if (job.research_status === "starting" && Date.now() - Date.parse(job.research_updated_at || job.updated_at) > 90_000) {
      await pitchStorageClient().from("pitch_reports").update({ research_status: "failed" })
        .eq("id", job.id).eq("response_id", job.response_id).eq("research_status", "starting").is("research_response_id", null);
    }
    return;
  }
  if (job.research_status !== "processing" || Date.now() - Date.parse(job.research_updated_at || job.updated_at) < 15_000) return;
  const response = await retrievePitchReport(job.research_response_id);
  if (response.status !== "queued" && response.status !== "in_progress") await finishResearch(job, response);
  else {
    const checkpoint = await readPitchReportStream(job.research_response_id, job.research_cursor, "");
    await pitchStorageClient().from("pitch_reports").update({ research_cursor: checkpoint.cursor,
      research_updated_at: new Date().toISOString(),
    }).eq("id", job.id).eq("research_response_id", job.research_response_id).eq("research_status", "processing")
      .lt("research_cursor", checkpoint.cursor);
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
    return job.split_report ? splitPending(job) : { ...pending, partial: job.partial_critique || undefined };
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
  return current.split_report ? splitPending(current) : { ...pending, partial: current.partial_critique || undefined };
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
  if (job.split_report) {
    const { error } = await pitchStorageClient().from("pitch_reports").update({ core_critique: critique,
      core_usage: response.usage || null, partial_critique: critique, updated_at: generatedAt,
    }).eq("id", job.id).eq("response_id", job.response_id).eq("status", "processing").is("core_critique", null);
    if (error) throw new Error("Your pitch feedback could not be saved yet. Please resume it.");
    return finishSplitReport(await latestJob(job));
  }
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
      split_report: !request.existingCritique && request.split === true,
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
  if (job.split_report) {
    if (job.research_status === "idle" && job.response_id) waitUntil(startResearch(job));
    if (job.research_status === "failed" && request.retry) {
      waitUntil(startResearch(job, true));
      return splitPending(job);
    }
    // During active streaming the private row already has the newest chunks.
    // Avoid an OpenAI GET on every poll, which would delay those chunks again.
    if (job.status === "processing") {
      await advanceResearch(job);
      job = await latestJob(job);
      if (job.core_critique) return finishSplitReport(job);
      if (Date.now() - Date.parse(job.updated_at) < 15_000) return splitPending(job);
    }
  }
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
