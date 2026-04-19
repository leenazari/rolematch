"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useSpeechSynthesis() {
  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentUrlRef = useRef<string | null>(null);

  useEffect(function () {
    return function () {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (currentUrlRef.current) {
        URL.revokeObjectURL(currentUrlRef.current);
        currentUrlRef.current = null;
      }
    };
  }, []);

  function cleanTextForSpeech(text: string): string {
    return text.replace(/\bread\b/gi, "look at");
  }

  function speakWithBrowser(text: string, onEnd?: () => void) {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      if (onEnd) onEnd();
      return;
    }
    window.speechSynthesis.cancel();
    const cleaned = cleanTextForSpeech(text);
    const utter = new SpeechSynthesisUtterance(cleaned);
    const voices = window.speechSynthesis.getVoices();
    const preferred =
      voices.find(function (v) { return v.name.includes("Google UK English Female"); }) ||
      voices.find(function (v) { return v.lang === "en-GB"; }) ||
      voices.find(function (v) { return v.lang.startsWith("en"); });
    if (preferred) utter.voice = preferred;
    utter.rate = 1.0;
    utter.pitch = 1.0;
    utter.onstart = function () { setSpeaking(true); };
    utter.onend = function () {
      setSpeaking(false);
      if (onEnd) onEnd();
    };
    utter.onerror = function () {
      setSpeaking(false);
      if (onEnd) onEnd();
    };
    window.speechSynthesis.speak(utter);
  }

  const speak = useCallback(async function (text: string, onEnd?: () => void) {
    if (!text || typeof window === "undefined") {
      if (onEnd) onEnd();
      return;
    }

    if (audioRef.current) {
      try { audioRef.current.pause(); } catch (e) {}
      audioRef.current = null;
    }
    if (currentUrlRef.current) {
      URL.revokeObjectURL(currentUrlRef.current);
      currentUrlRef.current = null;
    }

    const cleaned = cleanTextForSpeech(text);

    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: cleaned }),
      });

      if (!res.ok || !res.body) {
        console.warn("ElevenLabs failed, falling back to browser TTS");
        speakWithBrowser(text, onEnd);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      currentUrlRef.current = url;

      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onplay = function () { setSpeaking(true); };
      audio.onended = function () {
        setSpeaking(false);
        if (currentUrlRef.current) {
          URL.revokeObjectURL(currentUrlRef.current);
          currentUrlRef.current = null;
        }
        audioRef.current = null;
        if (onEnd) onEnd();
      };
      audio.onerror = function () {
        setSpeaking(false);
        if (currentUrlRef.current) {
          URL.revokeObjectURL(currentUrlRef.current);
          currentUrlRef.current = null;
        }
        audioRef.current = null;
        if (onEnd) onEnd();
      };

      try {
        await audio.play();
      } catch (playErr) {
        console.warn("Audio play failed:", playErr);
        setSpeaking(false);
        speakWithBrowser(text, onEnd);
      }
    } catch (e) {
      console.warn("TTS fetch failed, falling back:", e);
      speakWithBrowser(text, onEnd);
    }
  }, []);

  const stopSpeaking = useCallback(function () {
    if (audioRef.current) {
      try { audioRef.current.pause(); } catch (e) {}
      audioRef.current = null;
    }
    if (currentUrlRef.current) {
      URL.revokeObjectURL(currentUrlRef.current);
      currentUrlRef.current = null;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
  }, []);

  return { speak, stopSpeaking, speaking };
}
