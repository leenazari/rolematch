import { PublicError } from "@/lib/public-error";
import "server-only";
import { pitchStorageClient } from "@/lib/pitch-storage";
import { validReportAccess, tokenHash } from "@/lib/pitch-access";
import { isPitchSession, hasClosingAnswer, type PitchSessionState } from "@/lib/pitch-session-state";
type Row = { id: string; state: PitchSessionState; revision: number; status: string };
export async function loadPitchSession(id: string, accessToken: string): Promise<Row | null> {
  if (!validReportAccess(id, accessToken)) throw new PublicError("Invalid session access.");
  const { data, error } = await pitchStorageClient().from("pitch_sessions").select("id,state,revision,status")
    .eq("id", id).eq("access_token_hash", tokenHash(accessToken)).maybeSingle();
  if (error) throw new PublicError("Your saved pitch is temporarily unavailable. Please try again.");
  return data;
}
export async function savePitchSession(id: string, accessToken: string, state: PitchSessionState, beforeCreate?: () => Promise<void>, attempt = 0): Promise<{session: Row; completedNow: boolean}> {
  if (!validReportAccess(id, accessToken) || !isPitchSession(state) || (state.finished && !hasClosingAnswer(state.messages))) {
    throw new PublicError("Invalid pitch session.");
  }
  const fields = { state, revision: state.revision, company_name: state.pitchData.companyName,
    conversation: state.messages, current_question: state.currentQuestion,
    status: state.finished ? "completed" : "in_progress", finished_at: state.finishedAt, updated_at: new Date().toISOString() };
  let current = await loadPitchSession(id, accessToken);
  if (!current) {
    await beforeCreate?.();
    const { data, error } = await pitchStorageClient().from("pitch_sessions").insert({ id,
      access_token_hash: tokenHash(accessToken), ...fields }).select("id,state,revision,status").single();
    if (!error) return { session: data as Row, completedNow: state.finished };
    if (error.code !== "23505") throw new PublicError("Your pitch could not be saved online. Your device copy is still available. Please retry.");
    current = await loadPitchSession(id, accessToken);
    if (!current) throw new PublicError("Session not found.");
  }
  if (current.status === "completed" || current.revision >= state.revision) return { session: current, completedNow: false };
  // Accepted answers are append-only. Late autosaves cannot replace newer turns.
  if (!current.state.messages.every((m, i) => {
    const next = state.messages[i];
    return next && m.role === next.role && m.text === next.text && m.questionNumber === next.questionNumber && m.isFollowUpProbe === next.isFollowUpProbe;
  })) {
    throw new PublicError("This pitch was updated in another tab. Resume the saved pitch before continuing.");
  }
  const { data, error } = await pitchStorageClient().from("pitch_sessions").update(fields)
    .eq("id", id).eq("access_token_hash", tokenHash(accessToken)).eq("revision", current.revision)
    .eq("status", "in_progress").select("id,state,revision,status").maybeSingle();
  if (error) throw new PublicError("Your pitch could not be saved online. Please retry.");
  if (!data) {
    const latest = await loadPitchSession(id, accessToken);
    if (!latest) throw new PublicError("Session not found.");
    if (latest.status !== "completed" && latest.revision < state.revision) {
      if (attempt >= 2) throw new PublicError("Your pitch is being updated in another tab. Please retry saving.");
      return savePitchSession(id, accessToken, state, beforeCreate, attempt + 1);
    }
    return { session: latest, completedNow: false };
  }
  return { session: data as Row, completedNow: state.finished };
}
