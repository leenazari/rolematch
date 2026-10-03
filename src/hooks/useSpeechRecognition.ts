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
  const pendingStopRef = useRef<{ promise: Promise<string>; finish: () => void } | null>(null);

  const releaseRecognition = useCallback(function () {
    const r = recognitionRef.current;
    pendingStopRef.current?.finish();
    recognitionRef.current = null;
    if (r) {
      r.onresult = null;
      r.onerror = null;
      r.onend = null;
      try { r.abort(); } catch (e) {}
    }
  }, []);

  useEffect(function () {
    if (typeof window === "undefined") return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setSupported(false);
      return;
    }
    setSupported(true);
    return releaseRecognition;
  }, [releaseRecognition]);

  const start = useCallback(function () {
    if (typeof window === "undefined") return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    releaseRecognition();
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
      if (recognitionRef.current !== r) return;
      // results is the complete session snapshot, not a stream of new words.
      // Rebuild by result index so replayed/revised mobile results replace text.
      const finalParts: string[] = [];
      const interimParts: string[] = [];
      for (let i = 0; i < e.results.length; i++) {
        const t = e.results[i][0].transcript.trim();
        if (e.results[i].isFinal) finalParts.push(t);
        else interimParts.push(t);
      }
      transcriptRef.current = finalParts.filter(Boolean).join(" ");
      interimRef.current = interimParts.filter(Boolean).join(" ");
      setTranscript(transcriptRef.current);
      setInterim(interimRef.current);
    };
    r.onerror = function (e: any) {
      if (recognitionRef.current !== r) return;
      setError("Voice error: " + e.error);
    };
    r.onend = function () {
      if (recognitionRef.current !== r) return;
      recognitionRef.current = null;
      setListening(false);
    };

    recognitionRef.current = r;
    try {
      r.start();
      setListening(true);
    } catch (e) {
      releaseRecognition();
      setListening(false);
      setError("Unable to start voice input. Please try again.");
    }
  }, [releaseRecognition]);

  const stop = useCallback(function () {
    if (pendingStopRef.current) return pendingStopRef.current.promise;
    const r = recognitionRef.current;
    if (!r) {
      const final = (transcriptRef.current + " " + interimRef.current).trim();
      setListening(false);
      return Promise.resolve(final);
    }

    let finish!: () => void;
    let timer: ReturnType<typeof setTimeout>;
    const promise = new Promise<string>(function (resolve) {
      let settled = false;
      const handleEnd = function () {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const final = (transcriptRef.current + " " + interimRef.current).trim();
        r.onresult = null;
        r.onerror = null;
        r.onend = null;
        if (recognitionRef.current === r) recognitionRef.current = null;
        pendingStopRef.current = null;
        setListening(false);
        resolve(final);
      };
      finish = handleEnd;
    });
    pendingStopRef.current = { promise, finish };
    // Some browsers omit onend. Settle once and ignore any late old-session events.
    timer = setTimeout(function () {
      finish();
      try { r.abort(); } catch (e) {}
    }, 800);

    try {
      r.onend = finish;
      r.stop();
    } catch (e) {
      finish();
    }
    return promise;
  }, []);

  const hardReset = useCallback(function () {
    releaseRecognition();
    transcriptRef.current = "";
    interimRef.current = "";
    setTranscript("");
    setInterim("");
    setError("");
    setListening(false);
  }, [releaseRecognition]);

  return { supported, listening, transcript, interim, error, start, stop, hardReset };
}
