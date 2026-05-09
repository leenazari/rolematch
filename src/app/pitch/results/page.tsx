"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PitchData, PitchMessage, PitchCritique } from "@/types";

function formatTimestamp(iso: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const day = d.getDate();
    const month = d.toLocaleDateString("en-GB", { month: "long" });
    const year = d.getFullYear();
    const hours = d.getHours().toString().padStart(2, "0");
    const minutes = d.getMinutes().toString().padStart(2, "0");
    return day + " " + month + " " + year + ", " + hours + ":" + minutes;
  } catch (e) {
    return "";
  }
}

export default function PitchResultsPage() {
  const router = useRouter();
  const [pitchData, setPitchData] = useState<PitchData | null>(null);
  const [critique, setCritique] = useState<PitchCritique | null>(null);
  const [error, setError] = useState("");
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string>("");

  useEffect(function () {
    const dataStr = sessionStorage.getItem("pitchperfect_data");
    const convStr = sessionStorage.getItem("pitchperfect_conversation");
    if (!dataStr || !convStr) {
      router.push("/pitch");
      return;
    }
    try {
      const pd = JSON.parse(dataStr);
      const conv = JSON.parse(convStr);
      setPitchData(pd);

      const cached = sessionStorage.getItem("pitchperfect_critique");
      const cachedTime = sessionStorage.getItem("pitchperfect_generated_at");
      if (cached) {
        setCritique(JSON.parse(cached));
        if (cachedTime) setGeneratedAt(cachedTime);
        return;
      }

      generateCritique(pd, conv);
    } catch (e) {
      router.push("/pitch");
    }
  }, [router]);

  async function generateCritique(pd: PitchData, conv: PitchMessage[]) {
    try {
      const res = await fetch("/api/generate-pitch-results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pitchData: pd, conversation: conv }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || "Could not generate critique.");
        return;
      }
      setCritique(json.data);
      sessionStorage.setItem("pitchperfect_critique", JSON.stringify(json.data));
      const now = new Date().toISOString();
      sessionStorage.setItem("pitchperfect_generated_at", now);
      setGeneratedAt(now);
    } catch (e) {
      setError("Something went wrong. Please refresh to try again.");
    }
  }

  async function handleDownloadPdf() {
    if (!pitchData || !critique) return;
    setDownloadingPdf(true);
    try {
      const res = await fetch("/api/generate-pitch-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pitchData, critique, generatedAt }),
      });
      if (!res.ok) {
        setError("PDF download failed. Please try again.");
        setDownloadingPdf(false);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const safeName = pitchData.companyName.replace(/[^a-zA-Z0-9]+/g, "_");
      link.download = "PitchPerfect_" + safeName + ".pdf";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError("PDF download failed. Please try again.");
    } finally {
      setDownloadingPdf(false);
    }
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-slate-900 mb-4">Something went wrong</h1>
          <p className="text-slate-600 mb-6">{error}</p>
          <p className="text-sm text-slate-500 mb-6">Your conversation is saved. You don't need to redo it.</p>
          <div className="flex flex-col gap-3 items-center">
            <button
              onClick={function () {
                setError("");
                const dataStr = sessionStorage.getItem("pitchperfect_data");
                const convStr = sessionStorage.getItem("pitchperfect_conversation");
                if (dataStr && convStr) {
                  generateCritique(JSON.parse(dataStr), JSON.parse(convStr));
                } else {
                  router.push("/pitch");
                }
              }}
              className="px-6 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 font-medium"
            >
              Try generating again
            </button>
            <button onClick={function () { router.push("/"); }} className="text-sm text-slate-500 hover:text-slate-700 underline">
              Start over
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (!critique) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <div className="inline-block w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin mb-6"></div>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Putting your notes together</h2>
          <p className="text-slate-600">This usually takes about thirty seconds.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 px-6 py-12">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <div className="text-sm font-semibold text-purple-600 mb-3 tracking-widest uppercase">
            Pitch Perfect
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4 tracking-tight">
            Your pitch feedback
          </h1>
          {pitchData ? (
            <p className="text-slate-600">For {pitchData.companyName}</p>
          ) : null}
        </div>

        <div className="flex justify-center mb-10">
          <button
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
            className="px-6 py-3 bg-white border-2 border-purple-300 text-purple-700 rounded-xl hover:bg-purple-50 font-medium disabled:opacity-40"
          >
            {downloadingPdf ? "Building PDF..." : "Download as PDF"}
          </button>
        </div>

        <section className="bg-purple-50 border-l-4 border-purple-600 rounded-r-2xl p-6 mb-8">
          <div className="text-xs font-semibold uppercase tracking-wider text-purple-700 mb-2">
            Verdict
          </div>
          <p className="text-lg text-slate-800 leading-relaxed">
            {critique.verdict}
          </p>
        </section>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <section className="bg-white rounded-2xl p-6 border border-green-200 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wider text-green-700 mb-3">
              What's strong
            </div>
            <ul className="space-y-3">
              {critique.strong.map(function (item, i) {
                return (
                  <li key={i} className="text-sm text-slate-700 flex gap-2">
                    <span className="text-green-500 mt-0.5">✓</span>
                    <span>{item}</span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="bg-white rounded-2xl p-6 border border-amber-200 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wider text-amber-700 mb-3">
              What's weak
            </div>
            <ul className="space-y-3">
              {critique.weak.map(function (item, i) {
                return (
                  <li key={i} className="text-sm text-slate-700 flex gap-2">
                    <span className="text-amber-500 mt-0.5">!</span>
                    <span>{item}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        {critique.fatalFlaw ? (
          <section className="bg-red-50 border-2 border-red-300 rounded-2xl p-6 mb-8">
            <div className="text-xs font-semibold uppercase tracking-wider text-red-700 mb-2">
              The fatal flaw
            </div>
            <p className="text-base text-red-900 leading-relaxed font-medium">
              {critique.fatalFlaw}
            </p>
          </section>
        ) : null}

        {critique.sectorConcerns && critique.sectorConcerns.length > 0 ? (
          <section className="bg-white rounded-2xl p-6 mb-8 border border-slate-200 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-3">
              Sector specific concerns
            </div>
            <ul className="space-y-2">
              {critique.sectorConcerns.map(function (item, i) {
                return (
                  <li key={i} className="text-sm text-slate-700 flex gap-2">
                    <span className="text-slate-400 mt-0.5">→</span>
                    <span>{item}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <section className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl p-7 mb-8 border border-purple-200">
          <div className="text-xs font-semibold uppercase tracking-wider text-purple-700 mb-3">
            How I would tell this story
          </div>
          <p className="text-base text-slate-800 leading-relaxed italic">
            "{critique.revisedPitch}"
          </p>
        </section>

        <section className="bg-white rounded-2xl p-6 mb-8 border border-slate-200 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-3">
            What to do in the next 30 days
          </div>
          <ol className="space-y-3 list-decimal list-inside">
            {critique.thirtyDayActions.map(function (item, i) {
              return (
                <li key={i} className="text-sm text-slate-700 leading-relaxed pl-1">
                  {item}
                </li>
              );
            })}
          </ol>
        </section>

        <section className="bg-white rounded-2xl p-6 mb-8 border border-slate-200 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-4">
            Questions a real VC will ask, prepare for these
          </div>
          <div className="space-y-4">
            {critique.vcQuestions.map(function (q, i) {
              return (
                <div key={i} className="border-l-2 border-purple-300 pl-4">
                  <p className="text-sm font-semibold text-slate-900 mb-1">
                    {q.question}
                  </p>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {q.prepGuidance}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {generatedAt ? (
          <p className="text-xs text-slate-400 text-center mt-3">
            Generated: {formatTimestamp(generatedAt)}
          </p>
        ) : null}

        <div className="text-center mt-12">
          <button
            onClick={function () {
              sessionStorage.clear();
              router.push("/");
            }}
            className="text-sm text-slate-400 hover:text-slate-600 underline"
          >
            Start a new session
          </button>
        </div>
      </div>
    </main>
  );
}
