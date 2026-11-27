import type { PitchData, PitchMessage } from "@/types";

export const PITCH_SIGN_OFF = "Right, that's everything I need. Thanks for taking the time. Putting your feedback together now, it'll be on your screen in a moment.";
export type PitchSessionState = {
  pitchData: PitchData; messages: PitchMessage[]; currentQuestion: number; followUpsThisQuestion: number;
  draftAnswer: string; hasStarted: boolean; finished: boolean; pendingQuestion: boolean;
  revision: number; startedAt: string | null; finishedAt: string | null;
};
export function isPitchSession(value: unknown): value is PitchSessionState {
  const s = value as PitchSessionState;
  return !!s && !!s.pitchData && typeof s.pitchData.companyName === "string" && s.pitchData.companyName.length > 0 &&
    Array.isArray(s.messages) && s.messages.length <= 200 && s.messages.every(m => m && ["ai", "user"].includes(m.role) &&
      typeof m.text === "string" && m.text.length <= 30_000 && (m.questionNumber === undefined ||
        (Number.isInteger(m.questionNumber) && m.questionNumber >= 1 && m.questionNumber <= 7))) &&
    Number.isInteger(s.currentQuestion) && s.currentQuestion >= 1 && s.currentQuestion <= 7 &&
    Number.isInteger(s.followUpsThisQuestion) && s.followUpsThisQuestion >= 0 && s.followUpsThisQuestion <= 10 &&
    typeof s.draftAnswer === "string" && s.draftAnswer.length <= 30_000 &&
    typeof s.hasStarted === "boolean" && typeof s.finished === "boolean" && typeof s.pendingQuestion === "boolean" &&
    Number.isSafeInteger(s.revision) && s.revision >= 0 && JSON.stringify(s).length <= 750_000 &&
    (s.startedAt === null || (typeof s.startedAt === "string" && !isNaN(Date.parse(s.startedAt)))) &&
    (s.finishedAt === null || (typeof s.finishedAt === "string" && !isNaN(Date.parse(s.finishedAt))));
}
// Old tabs may still submit the retired form field. Never keep or return it.
export function withoutFounderEmail(state: PitchSessionState): PitchSessionState {
  const { recipientEmail: _retired, ...clean } = state as PitchSessionState & { recipientEmail?: unknown };
  return clean;
}
export function hasClosingAnswer(messages: PitchMessage[]): boolean {
  return messages.some((m, i) => m.role === "user" && !!m.text.trim() &&
    (m.questionNumber === 7 || (i > 0 && messages[i - 1].role === "ai" && messages[i - 1].questionNumber === 7)));
}
