"use client";

import { useCallback, useEffect, useState } from "react";

export function useSpeechSynthesis() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  const pickVoice = useCallback((): SpeechSynthesisVoice | null => {
    if (!voices.length) return null;
    const tests = [
      (v: SpeechSynthesisVoice) => v.name.includes("Google UK English Female"),
      (v: SpeechSynthesisVoice) => v.name.includes("Samantha"),
      (v: SpeechSynthesisVoice) => v.name.includes("Microsoft Libby"),
      (v: SpeechSynthesisVoice) => v.name.includes("Microsoft Sonia"),
      (v: SpeechSynthesisVoice) => v.lang === "en-GB",
      (v: SpeechSynthesisVoice) => v.lang.startsWith("en"),
    ];
    for (const test of tests) {
      const found = voices.find(test);
      if (found) return found;
    }
    return voices[0];
  }, [voices]);

  const speak = useCallback(
    (text: string, onEnd?: () => void) => {
      if (typeof window === "undefined" || !window.speechSynthesis) {
        onEnd?.();
        return;
      }
      window.speechSynthesis.cancel();
      const cleaned = text.replace(/\bread\b/gi, "look at");
      const utter = new SpeechSynthesisUtterance(cleaned);
      const voice = pickVoice();
      if (voice) utter.voice = voice;
      utter.rate = 1.0;
      utter.pitch = 1.0;
      utter.onstart = () => setSpeaking(true);
      utter.onend = () => {
        setSpeaking(false);
        onEnd?.();
      };
      utter.onerror = () => {
        setSpeaking(false);
        onEnd?.();
      };
      window.speechSynthesis.speak(utter);
    },
    [pickVoice]
  );

  const stopSpeaking = useCallback(() => {
    if (typeof window === "undefined") return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  return { speak, stopSpeaking, speaking };
}
