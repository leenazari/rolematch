"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Status = "idle" | "starting" | "recording" | "transcribing" | "error";
type Session = {
  stream?: MediaStream;
  recorder?: MediaRecorder;
  chunks: Blob[];
  audio?: Blob;
  timer?: ReturnType<typeof setTimeout>;
  request?: AbortController;
  companyName: string;
};
const MAX_AUDIO_BYTES = 3_500_000;

export function usePitchAudioRecorder(callbacks: {
  onComplete: (text: string) => void;
  onError: () => void;
}) {
  const [supported, setSupported] = useState(true);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [canRetry, setCanRetry] = useState(false);
  const sessionRef = useRef<Session | null>(null);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const release = useCallback(() => {
    const session = sessionRef.current;
    sessionRef.current = null;
    if (!session) return;
    clearTimeout(session.timer);
    session.request?.abort();
    if (session.recorder) {
      session.recorder.ondataavailable = null;
      session.recorder.onstop = null;
      session.recorder.onerror = null;
      if (session.recorder.state !== "inactive") {
        try { session.recorder.stop(); } catch {}
      }
    }
    session.stream?.getTracks().forEach(track => track.stop());
  }, []);

  useEffect(() => {
    setSupported(typeof navigator.mediaDevices?.getUserMedia === "function" && typeof window.MediaRecorder === "function");
    return release;
  }, [release]);

  const fail = useCallback((session: Session, message: string) => {
    if (sessionRef.current !== session) return;
    clearTimeout(session.timer);
    session.stream?.getTracks().forEach(track => track.stop());
    setStatus("error");
    setError(message);
    setCanRetry(Boolean(session.audio));
    callbacksRef.current.onError();
  }, []);

  const transcribe = useCallback(async (session: Session) => {
    if (sessionRef.current !== session || !session.audio || session.request) return;
    setStatus("transcribing");
    setError("");
    setCanRetry(false);
    const controller = new AbortController();
    session.request = controller;
    const timeout = setTimeout(() => controller.abort(), 65_000);
    try {
      const audio = session.audio;
      if (!audio.size) throw new Error("No audio was captured. Try again or type your answer.");
      if (audio.size > MAX_AUDIO_BYTES) {
        session.audio = undefined;
        throw new Error("That recording is too large. Record a shorter answer or type it below.");
      }
      const form = new FormData();
      const extension = audio.type.includes("mp4") ? "mp4" : "webm";
      form.append("audio", audio, "answer." + extension);
      form.append("companyName", session.companyName);
      const response = await fetch("/api/transcribe-pitch-audio", {
        method: "POST", body: form, signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok || !result.ok || typeof result.text !== "string") {
        throw new Error(result.error || "Could not transcribe your answer. Please retry.");
      }
      const text = result.text.trim();
      if (!text) throw new Error("No speech was detected. Try again or type your answer.");
      if (sessionRef.current !== session) return;
      session.audio = undefined;
      setStatus("idle");
      callbacksRef.current.onComplete(text);
    } catch (cause) {
      if (sessionRef.current !== session) return;
      const message = cause instanceof Error && cause.name !== "AbortError"
        ? cause.message : "Transcription timed out. Your recording is kept so you can retry.";
      fail(session, message);
    } finally {
      clearTimeout(timeout);
      session.request = undefined;
    }
  }, [fail]);

  const start = useCallback(async (companyName = "") => {
    release();
    setStatus("starting");
    setError("");
    setCanRetry(false);
    const session: Session = { chunks: [], companyName };
    sessionRef.current = session;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      if (sessionRef.current !== session) {
        stream.getTracks().forEach(track => track.stop());
        return false;
      }
      session.stream = stream;
      const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"]
        .find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 64_000,
      });
      session.recorder = recorder;
      recorder.ondataavailable = event => {
        if (sessionRef.current === session && event.data.size) session.chunks.push(event.data);
      };
      recorder.onerror = () => {
        if (sessionRef.current !== session) return;
        // Discard a failed capture rather than uploading incomplete audio.
        recorder.onstop = null;
        fail(session, "The microphone recording failed. Try again or type your answer.");
      };
      recorder.onstop = () => {
        if (sessionRef.current !== session) return;
        clearTimeout(session.timer);
        stream.getTracks().forEach(track => track.stop());
        session.audio = new Blob(session.chunks, { type: recorder.mimeType || "audio/webm" });
        session.chunks = [];
        void transcribe(session);
      };
      recorder.start(1000);
      setStatus("recording");
      // Bound each answer and stay below the host's request-body limit.
      session.timer = setTimeout(() => {
        if (sessionRef.current === session && recorder.state !== "inactive") recorder.stop();
      }, 180_000);
      return true;
    } catch (cause) {
      const denied = cause instanceof Error && cause.name === "NotAllowedError";
      fail(session, denied
        ? "Microphone access is blocked. Allow it in your browser settings, or type your answer."
        : "Unable to open the microphone. Try again or type your answer.");
      return false;
    }
  }, [release, fail, transcribe]);

  const stop = useCallback(() => {
    const session = sessionRef.current;
    const recorder = session?.recorder;
    if (session && recorder && recorder.state !== "inactive") {
      try { recorder.stop(); }
      catch { fail(session, "Unable to finish recording. Try again or type your answer."); }
    }
  }, [fail]);

  const retry = useCallback(() => {
    if (sessionRef.current?.audio) void transcribe(sessionRef.current);
  }, [transcribe]);

  const reset = useCallback(() => {
    release();
    setStatus("idle");
    setError("");
    setCanRetry(false);
  }, [release]);

  return { supported, status, error, canRetry, start, stop, retry, reset };
}
