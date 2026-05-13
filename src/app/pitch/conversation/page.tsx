"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { track } from "@vercel/analytics";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { usePitchSpeechSynthesis } from "@/hooks/usePitchSpeechSynthesis";
import VoiceOrb from "@/components/VoiceOrb";
import type { PitchData, PitchMessage } from "@/types";

type Phase = "idle" | "ai_speaking" | "listening" | "finalising" | "reviewing" | "thinking";

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
  const trackedQuestionsRef = useRef<Set<number>>(new Set());

  const { supported: voiceSupported, listening, transcript, interim, start, stop, hardReset } = useSpeechRecognition();
  const { speak, speaking, stopSpeaking } = usePitchSpeechSynthesis();

  useEffect(function () {
    const stored = sessionStorage.getItem("pitchperfect_data");
    if (!stored) {
      router.push("/pitch");
      return;
    }
    try {
      setPitchData(JSON.parse(stored));
    } catch (e) {
      router.push("/pitch");
    }
  }, [router]);

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
      track("conversation_q" + currentQuestion + "_reached");
    }
  }, [currentQuestion, hasStarted, introPlaying]);

  async function startConversation() {
    if (!pitchData) return;
    if (!sessionStorage.getItem("pitchperfect_started_at")) {
      sessionStorage.setItem("pitchperfect_started_at", new Date().toISOString());
    }
    setHasStarted(true);
    setIntroPlaying(true);
    setPhase("ai_speaking");
  }

  function handleIntroEnd() {
    setIntroPlaying(false);
    fetchNextQuestion([], 1, 0);
  }

  function handleSkipIntro() {
    if (videoRef.current) {
      try { videoRef.current.pause(); } catch (e) {}
    }
    handleIntroEnd();
  }

  async function fetchNextQuestion(
    history: PitchMessage[],
    questionNum: number,
    followUps: number
  ) {
    setPhase("thinking");
    try {
      const res = await fetch("/api/pitch-next-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pitchData,
          history,
          currentQuestion: questionNum,
          followUpsThisQuestion: followUps,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        track("error_encountered", { stage: "conversation", error: json.error || "unknown" });
        setPhase("idle");
        return;
      }

      const cleanedText = (json.text || "")
        .replace(/[—–―−‒]/g, ", ")
        .replace(/\s+-\s+/g, ", ")
        .replace(/,\s*,/g, ",")
        .replace(/\s+/g, " ")
        .trim();

      if (json.finished) {
        track("conversation_completed");
        setFinished(true);
const fallback = "Right, that's everything I need. Thanks for taking the time. Putting your feedback together now, it'll be on your screen in a moment.";        const finalText = cleanedText || fallback;
        const aiMsg: PitchMessage = { role: "ai", text: finalText, questionNumber: json.questionNumber };
        const finalHistory = [...history, aiMsg];
        setMessages(finalHistory);
        setPhase("ai_speaking");
        speak(finalText, function () {
          sessionStorage.setItem("pitchperfect_conversation", JSON.stringify(finalHistory));
          sessionStorage.setItem("pitchperfect_finished_at", new Date().toISOString());
          router.push("/pitch/results");
        });
        return;
      }

      const aiMsg: PitchMessage = { role: "ai", text: cleanedText, questionNumber: json.questionNumber };
      setMessages(function (prev) { return [...prev, aiMsg]; });
      setCurrentQuestion(json.questionNumber!);
      setFollowUpsThisQuestion(json.followUpsThisQuestion!);
      setPhase("ai_speaking");
      speak(cleanedText, function () {
        setPhase("idle");
      });
    } catch (e) {
      track("error_encountered", { stage: "conversation", error: "network" });
      setPhase("idle");
    }
  }

  function handleStartListening() {
    if (speaking) stopSpeaking();
    hardReset();
    setTimeout(function () {
      start();
      setPhase("listening");
    }, 100);
  }

  async function handleStopListening() {
    setPhase("finalising");
    const final = await stop();
    const captured = (final || "").trim();
    setDraftAnswer(function (prev) {
      const combined = prev ? prev + " " + captured : captured;
      return combined.trim();
    });
    setPhase("reviewing");
  }

  function handleResumeListening() {
    hardReset();
    setTimeout(function () {
      start();
      setPhase("listening");
    }, 100);
  }

  function handleClearAndRetry() {
    hardReset();
    setDraftAnswer("");
    setPhase("idle");
  }

  async function handleSendAnswer() {
    if (!draftAnswer.trim()) return;
    const userMsg: PitchMessage = { role: "user", text: draftAnswer.trim() };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setDraftAnswer("");
    await fetchNextQuestion(newHistory, currentQuestion, followUpsThisQuestion);
  }

  if (!pitchData) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-slate-500">Loading...</div>
      </main>
    );
  }

  if (!voiceSupported) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-slate-900 mb-4">Voice not supported</h1>
          <p className="text-slate-600 mb-6">
            This browser doesn't support voice input. Please open Pitch Perfect in Chrome or Edge on a desktop or Android device.
          </p>
          <button onClick={function () { router.push("/"); }} className="text-purple-600 underline">
            Back to home
          </button>
        </div>
      </main>
    );
  }

  const latestAi = [...messages].reverse().find(function (m) { return m.role === "ai"; });
  const reversedMessages = [...messages].reverse();

  const orbState =
    phase === "ai_speaking" ? "speaking" :
    phase === "listening" ? "listening" :
    phase === "thinking" ? "thinking" :
    phase === "finalising" ? "thinking" :
    "idle";

  let liveAnswerText = draftAnswer;
  if (phase === "listening") {
    const parts: string[] = [];
    if (draftAnswer) parts.push(draftAnswer);
    if (transcript) parts.push(transcript);
    const base = parts.join(" ").trim();
    liveAnswerText = base + (interim ? (base ? " " : "") + interim : "");
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 px-6 py-12">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-6">
          <div className="text-sm font-semibold text-purple-600 mb-3 tracking-widest uppercase">
            Pitch Perfect
          </div>
          {!finished && hasStarted && !introPlaying && currentQuestion <= 6 ? (
            <p className="text-slate-500 text-sm">Question {Math.min(currentQuestion, 6)} of 6</p>
          ) : null}
        </div>

        {!hasStarted ? (
          <div className="text-center max-w-xl mx-auto">
            <div className="mb-12">
              <VoiceOrb state="idle" />
            </div>
            <h1 className="text-3xl font-bold text-slate-900 mb-4">
              Ready to pitch {pitchData.companyName}?
            </h1>
            <p className="text-slate-600 mb-2">
              I'll ask six questions about the business. The conversation is friendly. The honest written feedback comes after.
            </p>
            <p className="text-slate-500 text-sm mb-8">
              Speak naturally. You can also edit your answer before sending.
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
                  value={liveAnswerText}
                  readOnly={phase === "listening" || phase === "finalising"}
                  onChange={function (e) { setDraftAnswer(e.target.value); }}
                  placeholder={phase === "listening" ? "Speak your answer..." : "Type your answer here, or use Add more to dictate."}
                  className="w-full p-3 text-base text-slate-900 leading-relaxed border border-slate-200 rounded-lg focus:border-purple-400 focus:outline-none resize-none min-h-[120px] bg-white"
                  rows={5}
                />
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
                    Capturing your last words...
                  </button>
                ) : null}

                {phase === "idle" && !finished && !draftAnswer ? (
                  <button
                    onClick={handleStartListening}
                    className="px-8 py-4 bg-purple-600 text-white rounded-2xl hover:bg-purple-700 font-medium shadow-lg shadow-purple-200"
                  >
                    Tap to answer
                  </button>
                ) : null}

                {phase === "idle" && !finished && draftAnswer ? (
                  <>
                    <button
                      onClick={handleResumeListening}
                      className="px-6 py-4 bg-white border-2 border-purple-300 text-purple-700 rounded-2xl hover:bg-purple-50 font-medium"
                    >
                      Add more
                    </button>
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
                    <button
                      onClick={handleResumeListening}
                      className="px-6 py-4 bg-white border-2 border-purple-300 text-purple-700 rounded-2xl hover:bg-purple-50 font-medium"
                    >
                      Add more
                    </button>
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
