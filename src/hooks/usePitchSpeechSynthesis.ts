"use client";

import { useSpeechSynthesis } from "./useSpeechSynthesis";

export function usePitchSpeechSynthesis() {
  return useSpeechSynthesis("investor");
}
