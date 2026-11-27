"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { expandPitchSpokenNumbers } from "@/lib/pitch-spoken-numbers";

export function useSpeechSynthesis(persona: "career" | "investor" = "career") {
  const [speaking, setSpeaking] = useState(false);
  const play = useRef(0);
  const request = useRef<AbortController | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const audioUrl = useRef<string | null>(null);
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);

  const clearAudio = useCallback(() => {
    if (audio.current) {
      audio.current.onplay = audio.current.onended = audio.current.onerror = null;
      audio.current.pause();
      audio.current = null;
    }
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    audioUrl.current = null;
  }, []);
  const cancel = useCallback(() => {
    play.current++;
    request.current?.abort();
    request.current = null;
    clearAudio();
    if (utterance.current) {
      utterance.current.onstart = utterance.current.onend = utterance.current.onerror = null;
      window.speechSynthesis?.cancel();
      utterance.current = null;
    }
  }, [clearAudio]);
  useEffect(() => cancel, [cancel]);

  const speak = useCallback(async (text: string, onEnd?: () => void) => {
    cancel();
    const id = play.current;
    const original = text.replace(/\bread\b/gi, "look at");
    const script = persona === "investor" ? expandPitchSpokenNumbers(original) : original;
    let ended = false, usedDevice = false;
    const current = () => !ended && play.current === id;
    const finish = () => {
      if (!current()) return;
      ended = true;
      clearAudio();
      utterance.current = null;
      request.current = null;
      setSpeaking(false);
      onEnd?.();
    };
    const useDevice = () => {
      if (!current() || usedDevice) return;
      usedDevice = true;
      clearAudio();
      // Some browser voices call a third-party service. Only allow installed English voices.
      const synth = window.speechSynthesis;
      const voices = synth?.getVoices().filter(voice => voice.localService && /^en\b/i.test(voice.lang));
      const voice = voices?.find(v => v.lang.toLowerCase() === "en-gb") || voices?.[0];
      if (!voice || typeof SpeechSynthesisUtterance === "undefined") return finish();
      const utter = new SpeechSynthesisUtterance(script);
      utterance.current = utter;
      utter.voice = voice;
      utter.onstart = () => { if (current()) setSpeaking(true); };
      utter.onend = utter.onerror = finish;
      try { synth.speak(utter); } catch { finish(); }
    };
    if (!script || typeof window === "undefined") return finish();
    const controller = new AbortController();
    request.current = controller;
    try {
      const res = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: script, persona }), signal: controller.signal });
      if (!current()) return;
      if (!res.ok || !res.body) return useDevice();
      const blob = await res.blob();
      if (!current()) return;
      if (!blob.size) return useDevice();
      const url = URL.createObjectURL(blob);
      audioUrl.current = url;
      const player = new Audio(url);
      audio.current = player;
      player.onplay = () => { if (current()) setSpeaking(true); };
      player.onended = finish;
      player.onerror = useDevice;
      await player.play();
    } catch { useDevice(); }
  }, [cancel, clearAudio, persona]);

  const stopSpeaking = useCallback(() => { cancel(); setSpeaking(false); }, [cancel]);
  return { speak, stopSpeaking, speaking };
}
