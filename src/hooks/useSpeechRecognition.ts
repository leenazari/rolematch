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
  const interimRef = useRef("");

  useEffect(function () {
    if (typeof window === "undefined") return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setSupported(false);
      return;
    }
    setSupported(true);
  }, []);

  const start = useCallback(function () {
    if (typeof window === "undefined") return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-GB";
    transcriptRef.current = "";
    interimRef.current = "";
    setTranscript("");
    setInterim("");
    setError("");

    r.onresult = function (e: any) {
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
      interimRef.current = interimText;
      setInterim(interimText);
    };
    r.onerror = function (e: any) {
      setError("Voice error: " + e.error);
    };
    r.onend = function () {
      setListening(false);
    };

    recognitionRef.current = r;
    r.start();
    setListening(true);
  }, []);

  const stop = useCallback(function () {
    return new Promise<string>(function (resolve) {
      if (!recognitionRef.current) {
        const final = (transcriptRef.current + " " + interimRef.current).trim();
        setListening(false);
        resolve(final);
        return;
      }

      const handleEnd = function () {
        const final = (transcriptRef.current + " " + interimRef.current).trim();
        setListening(false);
        resolve(final);
      };

      try {
        recognitionRef.current.onend = handleEnd;
        recognitionRef.current.stop();
      } catch (e) {
        handleEnd();
      }

      setTimeout(function () {
        if (listening) {
          handleEnd();
        }
      }, 800);
    });
  }, [listening]);

  const hardReset = useCallback(function () {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {}
      recognitionRef.current = null;
    }
    transcriptRef.current = "";
    interimRef.current = "";
    setTranscript("");
    setInterim("");
    setError("");
    setListening(false);
  }, []);

  return { supported, listening, transcript, interim, error, start, stop, hardReset };
}
