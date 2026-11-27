import { pitchStore } from "@/lib/pitch-browser-store";
import { reportAccess, type ReportAccess } from "@/lib/pitch-report-client";
import { isPitchSession, hasClosingAnswer, withoutFounderEmail, type PitchSessionState } from "@/lib/pitch-session-state";
import type { PitchData } from "@/types";
type Snapshot = { access: ReportAccess; state: PitchSessionState };
let saveTail: Promise<unknown> = Promise.resolve();
export function savedPitchSession(): Snapshot | null {
  try { const saved = JSON.parse(pitchStore.getItem("pitchperfect_session") || "null");
    return saved?.access?.reportId && saved.access.accessToken && isPitchSession(saved.state) ? { access: saved.access, state: withoutFounderEmail(saved.state) } : null;
  } catch { return null; }
}
export function checkpointPitch(state: PitchSessionState, access = reportAccess()): Snapshot {
  state = withoutFounderEmail(state);
  const snapshot = { access, state };
  pitchStore.setItem("pitchperfect_session", JSON.stringify(snapshot));
  pitchStore.setItem("pitchperfect_report_access", JSON.stringify(access));
  pitchStore.setItem("pitchperfect_data", JSON.stringify(state.pitchData));
  if (state.messages.length) pitchStore.setItem("pitchperfect_conversation", JSON.stringify(state.messages));
  if (state.startedAt) pitchStore.setItem("pitchperfect_started_at", state.startedAt);
  if (state.finishedAt) pitchStore.setItem("pitchperfect_finished_at", state.finishedAt);
  return snapshot;
}
export function beginPitchSession(pitchData: PitchData) {
  pitchStore.clear();
  return checkpointPitch({ pitchData, messages: [], currentQuestion: 1, followUpsThisQuestion: 0,
    draftAnswer: "", hasStarted: false, finished: false, pendingQuestion: false, revision: 0, startedAt: null, finishedAt: null });
}
export function persistPitchSession(snapshot: Snapshot) {
  const run = async () => {
    const response = await fetch("/api/pitch-session", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save", ...snapshot.access, state: snapshot.state }), signal: AbortSignal.timeout(20_000) });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "Your pitch could not be saved online. Please retry.");
    return result;
  };
  const pending = saveTail.catch(() => {}).then(run);
  saveTail = pending;
  return pending;
}
export async function recoverPitchSession(): Promise<Snapshot | null> {
  const local = savedPitchSession();
  let access: ReportAccess;
  try {
    const stored = pitchStore.getItem("pitchperfect_report_access");
    if (!local && !stored) return null;
    access = local?.access || JSON.parse(stored!);
    const response = await fetch("/api/pitch-session", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "load", ...access }), signal: AbortSignal.timeout(12_000) });
    const result = await response.json();
    const latest = savedPitchSession();
    if (response.ok && result?.ok && !result.session && local?.state.finished && latest?.access.reportId === access.reportId) {
      pitchStore.clear(); return null;
    }
    if (latest && latest.access.reportId !== access.reportId) return latest;
    if (!latest && !pitchStore.getItem("pitchperfect_report_access")) return null;
    if (result.ok && isPitchSession(result.session?.state) &&
      (!latest || result.session.state.revision >= latest.state.revision || result.session.state.finished)) {
      return checkpointPitch(result.session.state, access);
    }
  } catch { /* The durable device copy remains usable while the connection recovers. */ }
  return savedPitchSession() || local;
}
export function completedPitchOnDevice() {
  const saved = savedPitchSession();
  return saved && saved.state.finished && hasClosingAnswer(saved.state.messages) ? saved : null;
}
