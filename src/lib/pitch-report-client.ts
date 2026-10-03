import type { PitchData, PitchMessage, PitchCritique } from "@/types";

export type ReportAccess = { reportId: string; accessToken: string };
export function reportAccess(): ReportAccess {
  const stored = sessionStorage.getItem("pitchperfect_report_access");
  if (stored) return JSON.parse(stored);
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const access = { reportId: crypto.randomUUID(), accessToken: Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("") };
  sessionStorage.setItem("pitchperfect_report_access", JSON.stringify(access));
  return access;
}
function pause(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const aborted = () => { clearTimeout(timer); signal.removeEventListener("abort", aborted); reject(new DOMException("Aborted", "AbortError")); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", aborted); resolve(); }, 2000);
    signal.addEventListener("abort", aborted, { once: true });
    if (signal.aborted) aborted();
  });
}

export async function loadPitchReport(pitchData: PitchData, conversation: PitchMessage[], options: {
  signal: AbortSignal; retry?: boolean; existingCritique?: PitchCritique; generatedAt?: string;
}) {
  const access = reportAccess();
  const started = Date.now();
  let first = true;
  let failures = 0;
  while (!options.signal.aborted) {
    try {
      const response = await fetch("/api/generate-pitch-results", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: options.signal,
        body: JSON.stringify({ ...access, ...(first ? { pitchData, conversation, retry: options.retry && failures === 0,
          existingCritique: options.existingCritique, generatedAt: options.generatedAt } : {}) }),
      });
      const result = await response.json();
      if (!result.ok) throw new Error(result.error || "Could not generate your report. Please try again.");
      failures = 0;
      first = false;
      if (result.status === "completed") return result as { data: PitchCritique; generatedAt: string; pdfSaved: boolean; saveWarning?: string };
    } catch (error) {
      if (options.signal.aborted) throw error;
      if (++failures >= 3) throw error;
    }
    if (Date.now() - started > 10 * 60 * 1000) {
      throw new Error("Your report is still preparing. Try again to resume it; you do not need to repeat the conversation.");
    }
    await pause(options.signal);
  }
  throw new DOMException("Aborted", "AbortError");
}
