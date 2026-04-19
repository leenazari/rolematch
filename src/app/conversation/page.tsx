"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";
import VoiceOrb from "@/components/VoiceOrb";
import type { CVData, Message } from "@/types";

type Phase = "idle" | "ai_speaking" | "listening" | "reviewing" | "thinking";

export default function ConversationPage() {
  const router = useRouter();
  const [cvData, setCvData] = useState<CVData | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState(1);
  const [followUpsThisQuestion, setFollowUpsThisQuestion] = useState(0);
  const [coachingUsed, setCoachingUsed] = useState(false);
  const [finished, setFinished] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [draftAnswer, setDraftAnswer] = useState("");

  const { supported: voiceSupported, listening, interim, start, stop, hardReset } = useSpeechRecognition();
  const { speak, speaking, stopSpeaking } = useSpeechSynthesis();

  useEffect(() => {
    const stored = sessionStorage.getItem("rolematch_cv");
    if (!stored) {
      router.push("/");
      return;
    }
    try {
      setCvData(JSON.parse(stored));
    } catch {
      router.push("/");
    }
  }, [router]);

  // Keep phase in sync with what's actually happening
  useEffect(() => {
    if (speaking) {
      setPhase("ai_speaking");
    } else if (listening) {
      setPhase("listening");
    }
  }, [speaking, listening]);

  async function startConversation() {
    if (!cvData) return;
    setHasStarted(true);
    await fetchNextQuestion([], 1, 0, false);
  }

  async function fetchNextQuestion(
    history: Message[],
    questionNum: number,
    followUps: number,
    coachingUsedNow: boolean
  ) {
    setPhase("thinking");
    try {
      const res = await fetch("/api/next-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cvData,
          history,
          currentQuestion: questionNum,
          followUpsThisQuestion: followUps,
          coachingUsed: coachingUsedNow,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setPhase("idle");
        return;
      }
      if (json.finished) {
        setFinished(true);
        const finalText = json.text || "Thanks for that. I've got enough to work with. Generating your role recommendations now, give me about thirty seconds.";
        const aiMsg: Message = { role: "ai", text: finalText, questionNumber: json.questionNumber };
        const finalHistory = [...history, aiMsg];
        setMessages(finalHistory);
        setPhase("ai_speaking");
        speak(finalText, () => {
          sessionStorage.setItem("rolematch_conversation", JSON.stringify(finalHistory));
          router.push("/results");
        });
        return;
      }
      const aiMsg: Message = { role: "ai", text: json.text!, questionNumber: json.questionNumber };
      setMessages((prev) => [...prev, aiMsg]);
      setCurrentQuestion(json.questionNumber!);
      setFollowUpsThisQuestion(json.followUpsThisQuestion!);
      if (typeof json.coachingUsed === "boolean") setCoachingUsed(json.coachingUsed);
      setPhase("ai_speaking");
      speak(json.text!, () => {
        setPhase("idle");
      });
    } catch (e) {
      setPhase("idle");
    }
  }

  function handleStartListening() {
    if (speaking) stopSpeaking();
    hardReset();
    setDraftAnswer("");
    setTimeout(() => {
      start();
      setPhase("listening");
    }, 100);
  }

  function handleStopListening() {
    const final = stop();
    const captured = (final || "").trim();
    setDraftAnswer((prev) => {
      const combined = prev ? prev + " " + captured : captured;
      return combined.trim();
    });
    setPhase("reviewing");
  }

  function handleResumeListening() {
    hardReset();
    setTimeout(() => {
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
    const userMsg: Message = { role: "user", text: draftAnswer.trim() };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setDraftAnswer("");
    await fetchNextQuestion(newHistory, currentQuestion, followUpsThisQuestion, coachingUsed);
  }

  if (!cvData) {
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
            This browser doesn't support voice input. Please open RoleMatch in Chrome or Edge on a desktop or Android device.
          </p>
          <button onClick={() => router.push("/")} className="text-indigo-600 underline">
            Back to start
          </button>
        </div>
      </main>
    );
  }

  const latestAi = [...messages].reverse().find((m) => m.role === "ai");

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 px-6 py-12">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-6">
          <div className="text-sm font-semibold text-indigo-600 mb-3 tracking-widest uppercase">
            RoleMatch
          </div>
          {!finished && hasStarted && (
            <p className="text-slate-500 text-sm">Question {currentQuestion} of 6</p>
          )}
        </div>

        {!hasStarted ? (
          <div className="text-center max-w-xl mx-auto">
            <div className="mb-12">
              <VoiceOrb state="idle" />
            </div>
            <h1 className="text-3xl font-bold text-slate-900 mb-4">
              Hi {cvData.name.split(" ")[0]}, ready to talk?
            </h1>
            <p className="text-slate-600 mb-2">
              We'll go through six questions about what you actually want from work. Should take about ten minutes.
            </p>
            <p className="text-slate-500 text-sm mb-8">
              Speak naturally. There are no right answers. The more honest you are, the better the suggestions.
            </p>
            <button
              onClick={startConversation}
              className="px-8 py-4 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 font-medium text-lg shadow-lg shadow-indigo-200"
            >
              Start the conversation
            </button>
          </div>
        ) : (
          <>
            <div className="mb-10 mt-4">
              <VoiceOrb state={phase === "ai_speaking" ? "speaking" : phase === "reviewing" ? "idle" : phase} />
            </div>

            {/* AI's most recent question */}
            {latestAi && (
              <div className="bg-white rounded-3xl p-8 mb-6 border border-slate-200 shadow-sm">
                <p className="text-xl md:text-2xl text-slate-900 leading-relaxed text-center font-medium">
                  {latestAi.text}
                </p>
              </div>
            )}

            {/* Live transcript while listening */}
            {phase === "listening" && (
              <div className="bg-indigo-50 border-2 border-indigo-200 rounded-2xl p-6 mb-6">
                <div className="text-xs font-semibold uppercase tracking-wider text-indigo-700 mb-2">
                  Listening
                </div>
                <p className="text-lg text-slate-900 leading-relaxed min-h-[2rem]">
                  {draftAnswer && <span>{draftAnswer} </span>}
                  <span className="text-slate-500 italic">{interim}</span>
                  {!draftAnswer && !interim && (
                    <span className="text-slate-400 italic">Start speaking...</span>
                  )}
                </p>
              </div>
            )}

            {/* Captured draft, shown for review before sending */}
            {phase === "reviewing" && draftAnswer && (
              <div className="bg-white border-2 border-slate-200 rounded-2xl p-6 mb-6">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                  Your answer
                </div>
                <p className="text-lg text-slate-900 leading-relaxed">
                  {draftAnswer}
                </p>
              </div>
            )}

            {/* Buttons - context dependent */}
            <div className="flex flex-wrap gap-3 justify-center">
              {phase === "ai_speaking" && (
                <button
                  disabled
                  className="px-8 py-4 bg-slate-200 text-slate-500 rounded-2xl font-medium cursor-not-allowed"
                >
                  Wait for me to finish...
                </button>
              )}

              {phase === "thinking" && (
                <button
                  disabled
                  className="px-8 py-4 bg-slate-200 text-slate-500 rounded-2xl font-medium cursor-not-allowed"
                >
                  Thinking about your answer...
                </button>
              )}

              {phase === "idle" && !finished && (
                <button
                  onClick={handleStartListening}
                  className="px-8 py-4 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 font-medium shadow-lg shadow-indigo-200"
                >
                  Tap to answer
                </button>
              )}

              {phase === "listening" && (
                <button
                  onClick={handleStopListening}
                  className="px-8 py-4 bg-red-500 text-white rounded-2xl hover:bg-red-600 font-medium shadow-lg shadow-red-200"
                >
                  Stop
                </button>
              )}

              {phase === "reviewing" && (
                <>
                  <button
                    onClick={handleResumeListening}
                    className="px-6 py-4 bg-white border-2 border-indigo-300 text-indigo-700 rounded-2xl hover:bg-indigo-50 font-medium"
                  >
                    Add more
                  </button>
                  <button
                    onClick={handleClearAndRetry}
                    className="px-6 py-4 bg-white border-2 border-slate-300 text-slate-700 rounded-2xl hover:bg-slate-50 font-medium"
                  >
                    Try again
                  </button>
                  <button
                    onClick={handleSendAnswer}
                    disabled={!draftAnswer.trim()}
                    className="px-8 py-4 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 font-medium shadow-lg shadow-indigo-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Send my answer
                  </button>
                </>
              )}
            </div>

            {messages.length > 0 && (
              <div className="mt-12 text-center">
                <details className="text-xs text-slate-400">
                  <summary className="cursor-pointer">Conversation history</summary>
                  <div className="mt-4 text-left space-y-3 max-w-xl mx-auto">
                    {messages.map((m, i) => (
                      <div key={i} className={m.role === "ai" ? "text-slate-700" : "text-indigo-700"}>
                        <strong>{m.role === "ai" ? "RoleMatch:" : "You:"}</strong> {m.text}
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
