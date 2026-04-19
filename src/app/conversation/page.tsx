"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";
import type { CVData, Message } from "@/types";

export default function ConversationPage() {
  const router = useRouter();
  const [cvData, setCvData] = useState<CVData | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState(1);
  const [followUpsThisQuestion, setFollowUpsThisQuestion] = useState(0);
  const [waitingForAi, setWaitingForAi] = useState(false);
  const [finished, setFinished] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);

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

  async function startConversation() {
    if (!cvData) return;
    setHasStarted(true);
    await fetchNextQuestion([], 1, 0);
  }

  async function fetchNextQuestion(history: Message[], questionNum: number, followUps: number) {
    setWaitingForAi(true);
    try {
      const res = await fetch("/api/next-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cvData,
          history,
          currentQuestion: questionNum,
          followUpsThisQuestion: followUps,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setWaitingForAi(false);
        return;
      }
      if (json.finished) {
        setFinished(true);
        setWaitingForAi(false);
        const finalText = json.text || "Thanks for that. I've got enough to work with. Generating your role recommendations now, give me about thirty seconds.";
        const aiMsg: Message = { role: "ai", text: finalText, questionNumber: json.questionNumber };
        setMessages((prev) => [...prev, aiMsg]);
        speak(finalText, () => {
          sessionStorage.setItem("rolematch_conversation", JSON.stringify([...history, aiMsg]));
          router.push("/results");
        });
        return;
      }
      const aiMsg: Message = { role: "ai", text: json.text!, questionNumber: json.questionNumber };
      setMessages((prev) => [...prev, aiMsg]);
      setCurrentQuestion(json.questionNumber!);
      setFollowUpsThisQuestion(json.followUpsThisQuestion!);
      setWaitingForAi(false);
      speak(json.text!);
    } catch (e) {
      setWaitingForAi(false);
    }
  }

  function handleStartListening() {
    if (speaking) stopSpeaking();
    hardReset();
    setTimeout(() => start(), 100);
  }

  async function handleStopListening() {
    const final = stop();
    if (!final || final.trim().length < 2) return;
    const userMsg: Message = { role: "user", text: final };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    await fetchNextQuestion(newHistory, currentQuestion, followUpsThisQuestion);
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

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 px-6 py-12">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <div className="text-sm font-semibold text-indigo-600 mb-3 tracking-widest uppercase">
            RoleMatch
          </div>
          {!finished && hasStarted && (
            <p className="text-slate-500 text-sm">Question {currentQuestion} of 6</p>
          )}
        </div>

        {!hasStarted ? (
          <div className="text-center max-w-xl mx-auto">
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
            <div className="bg-white rounded-3xl p-8 mb-6 min-h-[300px] border border-slate-200 shadow-sm">
              {messages.length === 0 && waitingForAi && (
                <div className="text-slate-400 text-center py-8">Thinking...</div>
              )}
              {messages.map((m, i) => {
                const isLatest = i === messages.length - 1;
                if (m.role === "ai" && isLatest) {
                  return (
                    <div key={i} className="text-center">
                      <p className="text-2xl text-slate-900 leading-relaxed font-medium">
                        {m.text}
                      </p>
                      {speaking && (
                        <div className="mt-4 text-xs text-indigo-500 uppercase tracking-wider">
                          Speaking...
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              })}
              {listening && interim && (
                <div className="mt-6 pt-6 border-t border-slate-100 text-slate-500 italic text-center">
                  {interim}
                </div>
              )}
              {waitingForAi && messages.length > 0 && (
                <div className="mt-4 text-center text-slate-400 text-sm">Thinking about your answer...</div>
              )}
            </div>

            <div className="flex justify-center">
              {!listening ? (
                <button
                  onClick={handleStartListening}
                  disabled={waitingForAi || speaking || finished}
                  className="px-8 py-4 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-indigo-200"
                >
                  {speaking ? "Listening to me first..." : waitingForAi ? "Thinking..." : "Tap to answer"}
                </button>
              ) : (
                <button
                  onClick={handleStopListening}
                  className="px-8 py-4 bg-red-500 text-white rounded-2xl hover:bg-red-600 font-medium shadow-lg shadow-red-200"
                >
                  Done answering
                </button>
              )}
            </div>

            {messages.length > 0 && (
              <div className="mt-8 text-center">
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
