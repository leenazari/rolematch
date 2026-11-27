"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { track } from "@vercel/analytics";
import { pitchStore } from "@/lib/pitch-browser-store";
import { beginPitchSession, checkpointPitch, savedPitchSession, recoverPitchSession, persistPitchSession } from "@/lib/pitch-session-client";
import { PITCH_SIGN_OFF, type PitchSessionState } from "@/lib/pitch-session-state";
import { useInterviewRecorder } from "@/hooks/useInterviewRecorder";
import { usePitchSpeechSynthesis } from "@/hooks/usePitchSpeechSynthesis";
import VoiceOrb from "@/components/VoiceOrb";
import type { PitchData, PitchMessage } from "@/types";
function safeTrack(name: string, data?: Record<string, string>) { try { track(name, data); } catch {} }

type Phase = "idle" | "ai_speaking" | "starting" | "listening" | "finalising" | "reviewing" | "thinking";

const INTRO_VIDEO_URL = "https://12gousqtbfwu0esz.public.blob.vercel-storage.com/pitchperfect.mp4";

export default function PitchConversationPage() {
  const router = useRouter();
  const [pitchData, setPitchData] = useState<PitchData | null>(null);
  const [messages, setMessages] = useState<PitchMessage[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState(1);
  const [followUpsThisQuestion, setFollowUpsThisQuestion] = useState(0);
  const [finished, setFinished] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [draftAnswer, setDraftAnswer] = useState("");
  const [introPlaying, setIntroPlaying] = useState(false);
  const [videoBuffering, setVideoBuffering] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sessionRef = useRef<ReturnType<typeof savedPitchSession>>(null);
  const savedRevisionRef = useRef(-1);
  const busyRef = useRef(false);
  const introEndedRef = useRef(false);
  const aliveRef = useRef(true);
  const navigatedRef = useRef(false);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingBaseRef = useRef("");
  const [saveStatus, setSaveStatus] = useState("");
  const [turnError, setTurnError] = useState("");
  const trackedQuestionsRef = useRef<Set<number>>(new Set());

  const {
    supported: voiceSupported, status: recordingStatus, error: voiceError, canRetry,
    liveText, liveStatus, start, stop, retry, reset: hardReset,
  } = useInterviewRecorder({
    onComplete(text) {
      const answer = [recordingBaseRef.current, text].filter(Boolean).join(" ").trim();
      setDraftAnswer(answer);
      saveDraft(answer);
      setPhase("reviewing");
    },
    onError() { setPhase("reviewing"); },
  });
  const { speak, speaking, stopSpeaking } = usePitchSpeechSynthesis();

  useEffect(() => {
    if (recordingStatus === "transcribing") setPhase("finalising");
  }, [recordingStatus]);

  useEffect(() => {
    aliveRef.current = true;
    let active = true;
    function restore(saved: NonNullable<ReturnType<typeof savedPitchSession>>) {
      if (!active) return;
      sessionRef.current = saved;
      const state = saved.state;
      setPitchData(state.pitchData); setMessages(state.messages); setCurrentQuestion(state.currentQuestion);
      setFollowUpsThisQuestion(state.followUpsThisQuestion); setDraftAnswer(state.draftAnswer);
      setHasStarted(state.hasStarted); setFinished(state.finished); setIntroPlaying(false);
      setPhase(state.draftAnswer ? "reviewing" : "idle");
      if (state.pendingQuestion) setTurnError("Your last answer is saved. Continue your pitch to get the next question.");
      if (state.finished && !navigatedRef.current) { navigatedRef.current = true; router.push("/pitch/results"); }
    }
    const local = savedPitchSession();
    if (local) restore(local);
    else {
      try {
        const raw = pitchStore.getItem("pitchperfect_data");
        if (raw) restore(beginPitchSession(JSON.parse(raw)));
      } catch { setTurnError("Your pitch could not be opened. Retry loading your saved session."); }
    }
    recoverPitchSession().then(saved => {
      if (saved && (!sessionRef.current || saved.state.finished || saved.state.revision >= sessionRef.current.state.revision)) restore(saved);
      else if (!saved && !sessionRef.current) setTurnError("No saved pitch was found on this device.");
    });
    return () => { active = false; aliveRef.current = false; if (draftTimerRef.current) clearTimeout(draftTimerRef.current); };
  }, [router]);

  useEffect(() => {
    if (liveText && (phase === "listening" || phase === "finalising")) {
      saveDraft([recordingBaseRef.current, liveText].filter(Boolean).join(" "));
    }
  }, [liveText, phase]);

  function checkpoint(patch: Partial<PitchSessionState>) {
    if (!sessionRef.current) throw new Error("Your saved session is not ready yet. Please retry.");
    const next = checkpointPitch({ ...sessionRef.current.state, ...patch, revision: sessionRef.current.state.revision + 1 }, sessionRef.current.access);
    sessionRef.current = next;
    return next;
  }
  async function ensureSaved(snapshot = sessionRef.current) {
    if (!snapshot) throw new Error("Your saved session is not ready yet.");
    if (savedRevisionRef.current >= snapshot.state.revision) return;
    setSaveStatus("Saving your pitch...");
    try {
      await persistPitchSession(snapshot);
      savedRevisionRef.current = Math.max(savedRevisionRef.current, snapshot.state.revision);
      setSaveStatus((sessionRef.current?.state.revision || 0) <= savedRevisionRef.current ? "Saved online" : "Saving your pitch...");
    } catch (error) { setSaveStatus("Saved on this device. Online saving needs a retry."); throw error; }
  }
  function saveDraft(answer: string) {
    if (!sessionRef.current || sessionRef.current.state.finished) return;
    checkpoint({ draftAnswer: answer });
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => { ensureSaved().catch(() => {}); }, 800);
  }

  useEffect(function () {
    if (speaking) {
      setPhase("ai_speaking");
    }
  }, [speaking]);

  // Track question-reached events at key milestones
  useEffect(function () {
    if (!hasStarted || introPlaying) return;
    const milestones = [1, 3, 5];
    if (milestones.includes(currentQuestion) && !trackedQuestionsRef.current.has(currentQuestion)) {
      trackedQuestionsRef.current.add(currentQuestion);
      safeTrack("conversation_q" + currentQuestion + "_reached");
    }
  }, [currentQuestion, hasStarted, introPlaying]);

  async function startConversation() {
    if (!pitchData || busyRef.current) return;
    busyRef.current = true; setTurnError("");
    try {
      await ensureSaved(checkpoint({ hasStarted: true, startedAt: sessionRef.current?.state.startedAt || new Date().toISOString(), pendingQuestion: true }));
      setHasStarted(true); setIntroPlaying(true); setPhase("ai_speaking");
      introEndedRef.current = false;
    } catch (error) { setTurnError((error as Error).message); }
    finally { busyRef.current = false; }
  }
  function handleIntroEnd() { if (introEndedRef.current) return; introEndedRef.current = true; setIntroPlaying(false); fetchNextQuestion([], 1, 0); }
  function handleSkipIntro() { try { videoRef.current?.pause(); } catch {} handleIntroEnd(); }

  async function completeConversation(history: PitchMessage[]) {
    stopSpeaking();
    const finalHistory = history.at(-1)?.role === "ai" ? history : [...history,
      { role: "ai" as const, text: PITCH_SIGN_OFF, questionNumber: 7 }];
    setMessages(finalHistory); setFinished(true); setPhase("thinking");
    const saved = checkpoint({ messages: finalHistory, currentQuestion: 7, draftAnswer: "", finished: true,
      pendingQuestion: false, finishedAt: sessionRef.current?.state.finishedAt || new Date().toISOString() });
    await ensureSaved(saved);
    if (!aliveRef.current) return;
    safeTrack("conversation_completed");
    // Saving and navigation never depend on the final voice playback callback.
    if (!navigatedRef.current) { navigatedRef.current = true; router.push("/pitch/results"); }
  }
  async function fetchNextQuestion(history: PitchMessage[], questionNum: number, followUps: number) {
    setPhase("thinking"); setTurnError("");
    try {
      await ensureSaved();
      const res = await fetch("/api/pitch-next-question", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pitchData, history, currentQuestion: questionNum, followUpsThisQuestion: followUps }) });
      const json = await res.json();
      if (!aliveRef.current) return;
      if (!res.ok || !json.ok) throw new Error(json.error || "The next question could not load. Please retry.");
      const cleanedText = (json.text || "").replace(/[—–―−‒]/g, ", ").replace(/\s+-\s+/g, ", ")
        .replace(/,\s*,/g, ",").replace(/\s+/g, " ").trim();
      if (json.finished) { await completeConversation(history); return; }
      if (!cleanedText || !Number.isInteger(json.questionNumber) || json.questionNumber < 1 || json.questionNumber > 7) {
        throw new Error("The next question could not load. Please retry.");
      }
      const aiMsg: PitchMessage = { role: "ai", text: cleanedText, questionNumber: json.questionNumber };
      const nextHistory = [...history, aiMsg];
      setMessages(nextHistory); setCurrentQuestion(json.questionNumber); setFollowUpsThisQuestion(json.followUpsThisQuestion || 0);
      await ensureSaved(checkpoint({ messages: nextHistory, currentQuestion: json.questionNumber,
        followUpsThisQuestion: json.followUpsThisQuestion || 0, pendingQuestion: false }));
      setPhase("ai_speaking");
      Promise.resolve(speak(cleanedText, () => setPhase("idle"))).catch(() => setPhase("idle"));
    } catch (error) {
      safeTrack("error_encountered", { stage: "conversation", error: "turn_failed" });
      setTurnError((error as Error).message || "Your answer is saved. Please continue your pitch."); setPhase("idle");
    }
  }
  async function handleStartListening() {
    if (speaking) stopSpeaking();
    recordingBaseRef.current = draftAnswer;
    setPhase("starting");
    if (await start(pitchData?.companyName)) setPhase("listening");
  }
  function handleStopListening() { setPhase("finalising"); stop(); }
  async function handleResumeListening() { await handleStartListening(); }
  function handleClearAndRetry() { hardReset(); setDraftAnswer(""); saveDraft(""); setPhase("idle"); }

  async function handleSendAnswer() {
    if (!draftAnswer.trim() || busyRef.current || sessionRef.current?.state.pendingQuestion || sessionRef.current?.state.finished) return;
    busyRef.current = true; setTurnError("");
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    hardReset();
    const userMsg: PitchMessage = { role: "user", text: draftAnswer.trim(), questionNumber: currentQuestion };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory); setDraftAnswer("");
    try {
      if (currentQuestion === 7 && messages.some(m => m.role === "ai" && m.questionNumber === 7)) {
        await completeConversation(newHistory);
      } else {
        await ensureSaved(checkpoint({ messages: newHistory, draftAnswer: "", pendingQuestion: true }));
        await fetchNextQuestion(newHistory, currentQuestion, followUpsThisQuestion);
      }
    } catch (error) { setTurnError((error as Error).message); setPhase("idle"); }
    finally { busyRef.current = false; }
  }
  async function continueSavedPitch() {
    if (!sessionRef.current || busyRef.current) return;
    busyRef.current = true; setTurnError("");
    try {
      await ensureSaved();
      const state = sessionRef.current.state;
      setHasStarted(state.hasStarted); setIntroPlaying(false);
      if (state.finished) { router.push("/pitch/results"); return; }
      if (state.pendingQuestion) await fetchNextQuestion(state.messages, state.currentQuestion, state.followUpsThisQuestion);
      else setPhase(state.draftAnswer ? "reviewing" : "idle");
    } catch (error) { setTurnError((error as Error).message); }
    finally { busyRef.current = false; }
  }

  if (!pitchData) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-center"><p className="text-slate-500">{turnError || "Loading your saved pitch..."}</p><a href="/pitch" className="mt-4 inline-block text-purple-700 underline">Open Pitch Perfect</a></div>
      </main>
    );
  }

  const latestAi = [...messages].reverse().find(function (m) { return m.role === "ai"; });
  const reversedMessages = [...messages].reverse();

  const orbState =
    phase === "ai_speaking" ? "speaking" :
    phase === "listening" ? "listening" :
    phase === "thinking" ? "thinking" :
    phase === "finalising" || phase === "starting" ? "thinking" :
    "idle";

  const displayedAnswer = phase === "listening" || phase === "finalising"
    ? [draftAnswer, liveText].filter(Boolean).join(" ")
    : draftAnswer;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 px-6 py-12">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-6">
          <div className="text-sm font-semibold text-purple-600 mb-3 tracking-widest uppercase">
            Pitch Perfect
          </div>
          {!finished && hasStarted && !introPlaying ? (
            <p className="text-slate-500 text-sm">{currentQuestion === 7 ? "Closing pitch · about 30 seconds" : `Question ${currentQuestion} of 6`}</p>
          ) : null}
        </div>

        {saveStatus ? <p role="status" className="text-center text-xs text-slate-500 mb-4">{saveStatus}</p> : null}
        {turnError ? <div role="alert" className="rounded-xl bg-amber-50 border border-amber-200 p-4 mb-6 text-amber-900">
          <p>{turnError}</p><p className="mt-1 text-sm">Your saved answers have been kept.</p>
          <button onClick={continueSavedPitch} className="mt-3 font-semibold underline">Continue saved pitch</button>
        </div> : null}
        {finished ? <div className="text-center mb-6"><p>Your closing answer is saved. Preparing your feedback.</p>
          <button onClick={continueSavedPitch} className="mt-3 font-semibold text-purple-700 underline">Continue to my results</button></div> : null}
        {!hasStarted ? (
          <div className="text-center max-w-xl mx-auto">
            <div className="mb-12">
              <VoiceOrb state="idle" />
            </div>
            <h1 className="text-3xl font-bold text-slate-900 mb-4">
              Ready to pitch {pitchData.companyName}?
            </h1>
            <p className="text-slate-600 mb-2">
              I'll ask six questions about the business, then invite you to give a 30-second closing pitch. The conversation is friendly. Afterwards, download your PDF before leaving the results page.
            </p>
            <p className="text-slate-500 text-sm mb-8">
              Your investor has an AI-generated voice. Speak naturally or type, then review your answer before sending.
            </p>
            <button
              onClick={startConversation}
              className="px-8 py-4 bg-purple-600 text-white rounded-2xl hover:bg-purple-700 font-medium text-lg shadow-lg shadow-purple-200"
            >
              Start the conversation
            </button>
          </div>
        ) : (
          <>
            {introPlaying ? (
              <div className="mb-10 mt-4 max-w-2xl mx-auto relative">
                <video
                  ref={videoRef}
                  src={INTRO_VIDEO_URL}
                  autoPlay
                  playsInline
                  onEnded={handleIntroEnd}
                  onError={handleIntroEnd}
                  onWaiting={function () { setVideoBuffering(true); }}
                  onPlaying={function () { setVideoBuffering(false); }}
                  onLoadedData={function () { setVideoBuffering(false); }}
                  className="w-full rounded-3xl shadow-xl shadow-purple-200 bg-slate-900"
                />
                {videoBuffering ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-900 bg-opacity-50 rounded-3xl">
                    <div className="text-white text-sm flex items-center gap-3">
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Loading...
                    </div>
                  </div>
                ) : null}
                <div className="text-center mt-4">
                  <button
                    onClick={handleSkipIntro}
                    className="text-sm text-slate-400 hover:text-slate-600 underline"
                  >
                    Skip intro
                  </button>
                </div>
              </div>
            ) : (
              <div className="mb-10 mt-4">
                <VoiceOrb state={orbState} />
              </div>
            )}

            {!introPlaying && latestAi ? (
              <div className="bg-white rounded-3xl p-8 mb-6 border border-slate-200 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-wider text-purple-600 mb-3 text-center">
                  Investor
                </div>
                <p className="text-xl md:text-2xl text-slate-900 leading-relaxed text-center font-medium">
                  {latestAi.text}
                </p>
              </div>
            ) : null}

            {!introPlaying && (phase === "listening" || phase === "finalising" || phase === "reviewing" || (phase === "idle" && draftAnswer)) ? (
              <div className={
                phase === "listening"
                  ? "bg-purple-50 border-2 border-purple-200 rounded-2xl p-6 mb-6"
                  : "bg-white border-2 border-slate-200 rounded-2xl p-6 mb-6"
              }>
                <div className={
                  phase === "listening"
                    ? "text-xs font-semibold uppercase tracking-wider text-purple-700 mb-2 flex items-center gap-2"
                    : "text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-2"
                }>
                  {phase === "listening" ? (
                    <>
                      <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                      Listening
                    </>
                  ) : phase === "finalising" ? (
                    <>
                      <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></span>
                      Finalising your answer...
                    </>
                  ) : (
                    <>Your answer (edit if needed)</>
                  )}
                </div>
                <textarea
                  value={displayedAnswer}
                  readOnly={phase === "listening" || phase === "finalising"}
                  onChange={function (e) { setDraftAnswer(e.target.value); saveDraft(e.target.value); }}
                  placeholder={phase === "listening" ? "Speak now. Your words will appear here as you talk." : "Type your answer here, or use Add more to dictate."}
                  className="w-full p-3 text-base text-slate-900 leading-relaxed border border-slate-200 rounded-lg focus:border-purple-400 focus:outline-none resize-none min-h-[120px] bg-white"
                  rows={5}
                />
                {phase === "listening" ? (
                  <p className="mt-2 text-sm text-purple-700">
                    {liveStatus === "unavailable"
                      ? "Live text is temporarily unavailable. Your audio is still recording and will appear after Stop."
                      : "Your words appear as you speak. Press Stop when finished, then review and send your answer."}
                  </p>
                ) : null}
              </div>
            ) : null}

            {!introPlaying && voiceError ? (
              <div role="alert" className="mb-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                <p>{voiceError}</p>
                {canRetry && phase === "reviewing" ? (
                  <button onClick={retry} className="mt-2 font-semibold underline">Retry transcription</button>
                ) : null}
              </div>
            ) : null}

            {!introPlaying ? (
              <div className="flex flex-wrap gap-3 justify-center">
                {phase === "ai_speaking" ? (
                  <button
                    disabled
                    className="px-8 py-4 bg-slate-200 text-slate-500 rounded-2xl font-medium cursor-not-allowed"
                  >
                    Wait for me to finish...
                  </button>
                ) : null}

                {phase === "thinking" ? (
                  <button
                    disabled
                    className="px-8 py-4 bg-slate-200 text-slate-500 rounded-2xl font-medium cursor-not-allowed"
                  >
                    Thinking about your answer...
                  </button>
                ) : null}

                {phase === "finalising" ? (
                  <button
                    disabled
                    className="px-8 py-4 bg-amber-100 text-amber-700 rounded-2xl font-medium cursor-not-allowed"
                  >
                    Transcribing your answer...
                  </button>
                ) : null}

                {phase === "starting" ? (
                  <>
                    <span className="px-6 py-4 text-slate-500">Opening microphone...</span>
                    <button onClick={handleClearAndRetry} className="text-purple-600 underline">Cancel</button>
                  </>
                ) : null}

                {phase === "idle" && !finished && !turnError && !draftAnswer ? (
                  <>
                  {voiceSupported ? <button
                    onClick={handleStartListening}
                    className="px-8 py-4 bg-purple-600 text-white rounded-2xl hover:bg-purple-700 font-medium shadow-lg shadow-purple-200"
                  >
                    Tap to answer
                  </button> : null}
                  <button onClick={() => setPhase("reviewing")} className="px-6 py-4 text-purple-700 underline">Type my answer</button>
                  </>
                ) : null}

                {phase === "idle" && !finished && !turnError && draftAnswer ? (
                  <>
                    {voiceSupported ? <button
                      onClick={handleResumeListening}
                      className="px-6 py-4 bg-white border-2 border-purple-300 text-purple-700 rounded-2xl hover:bg-purple-50 font-medium"
                    >
                      Add more
                    </button> : null}
                    <button
                      onClick={handleClearAndRetry}
                      className="px-6 py-4 bg-white border-2 border-slate-300 text-slate-700 rounded-2xl hover:bg-slate-50 font-medium"
                    >
                      Clear
                    </button>
                    <button
                      onClick={handleSendAnswer}
                      disabled={!draftAnswer.trim()}
                      className="px-8 py-4 bg-purple-600 text-white rounded-2xl hover:bg-purple-700 font-medium shadow-lg shadow-purple-200 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Send my answer
                    </button>
                  </>
                ) : null}

                {phase === "listening" ? (
                  <button
                    onClick={handleStopListening}
                    className="px-8 py-4 bg-red-500 text-white rounded-2xl hover:bg-red-600 font-medium shadow-lg shadow-red-200"
                  >
                    Stop
                  </button>
                ) : null}

                {phase === "reviewing" ? (
                  <>
                    {voiceSupported ? <button
                      onClick={handleResumeListening}
                      className="px-6 py-4 bg-white border-2 border-purple-300 text-purple-700 rounded-2xl hover:bg-purple-50 font-medium"
                    >
                      Add more
                    </button> : null}
                    <button
                      onClick={handleClearAndRetry}
                      className="px-6 py-4 bg-white border-2 border-slate-300 text-slate-700 rounded-2xl hover:bg-slate-50 font-medium"
                    >
                      Clear
                    </button>
                    <button
                      onClick={handleSendAnswer}
                      disabled={!draftAnswer.trim()}
                      className="px-8 py-4 bg-purple-600 text-white rounded-2xl hover:bg-purple-700 font-medium shadow-lg shadow-purple-200 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Send my answer
                    </button>
                  </>
                ) : null}
              </div>
            ) : null}

            {messages.length > 1 && !introPlaying ? (
              <div className="mt-12 text-center">
                <details className="text-xs text-slate-400">
                  <summary className="cursor-pointer hover:text-slate-600">Conversation history</summary>
                  <div className="mt-4 text-left space-y-3 max-w-xl mx-auto">
                    {reversedMessages.map(function (m, i) {
                      return (
                        <div key={i} className={m.role === "ai" ? "text-slate-700 text-sm" : "text-purple-700 text-sm"}>
                          <strong>{m.role === "ai" ? "Investor:" : "You:"}</strong> {m.text}
                        </div>
                      );
                    })}
                  </div>
                </details>
              </div>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
