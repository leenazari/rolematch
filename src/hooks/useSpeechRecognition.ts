"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useSpeechRecognition() {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setSupported(false);
      return;
    }
    setSupported(true);
  }, []);

  const start = useCallback(() => {
    if (typeof window === "undefined") return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-GB";
    transcriptRef.current = "";
    setTranscript("");
    setInterim("");
    setError("");

    r.onresult = (e: any) => {
      let finalText = "";
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interimText += t;
      }
      if (finalText) {
        transcriptRef.current = (transcriptRef.current + " " + finalText).trim();
        setTranscript(transcriptRef.current);
      }
      setInterim(interimText);
    };
    r.onerror = (e: any) => {
      setError("Voice error: " + e.error);
    };
    r.onend = () => {
      setListening(false);
    };

    recognitionRef.current = r;
    r.start();
    setListening(true);
  }, []);

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }
    setListening(false);
    const interimNow = (recognitionRef.current as any)?.interimText || "";
    const final = transcriptRef.current.trim();
    return final || interimNow || "";
  }, []);

  const hardReset = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {}
      recognitionRef.current = null;
    }
    transcriptRef.current = "";
    setTranscript("");
    setInterim("");
    setError("");
    setListening(false);
  }, []);

  return { supported, listening, transcript, interim, error, start, stop, hardReset };
}
