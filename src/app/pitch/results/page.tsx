"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { loadPitchReport, reportAccess, type ReportAccess } from "@/lib/pitch-report-client";
import { ReportInsights } from "./report-insights";
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

function VerdictBadge(props: { category: string }) {
  const { category } = props;
  const styles = (function () {
    if (category === "ready") {
      return {
        bg: "bg-green-100",
        border: "border-green-300",
        text: "text-green-800",
        label: "Ready to raise",
      };
    }
    if (category === "almost") {
      return {
        bg: "bg-amber-100",
        border: "border-amber-300",
        text: "text-amber-800",
        label: "Almost ready",
      };
    }
    return {
      bg: "bg-slate-100",
      border: "border-slate-300",
      text: "text-slate-700",
      label: "Keep building",
    };
  })();

  return (
    <div className={"inline-flex items-center px-4 py-2 rounded-full border-2 " + styles.bg + " " + styles.border + " " + styles.text + " font-semibold text-sm uppercase tracking-wider"}>
      {styles.label}
    </div>
  );
}

const LOADING_MESSAGES = [
  "Reading back through everything you said...",
  "Looking for what's really strong in your business...",
  "Pulling on the threads that might be weak...",
  "Thinking about what real VCs would ask next...",
  "Putting the verdict together...",
];

function LoadingState(props: { companyName: string }) {
  const { companyName } = props;
  const [messageIndex, setMessageIndex] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(function () {
    const interval = setInterval(function () {
      setFading(true);
      setTimeout(function () {
        setMessageIndex(function (prev) {
          if (prev >= LOADING_MESSAGES.length - 1) {
            return prev;
          }
          return prev + 1;
        });
        setFading(false);
      }, 400);
    }, 6000);

    return function () { clearInterval(interval); };
  }, []);

  return (
    <main className="min-h-screen mesh-bg-pitch flex items-center justify-center px-6">
      <div className="glass-card-strong rounded-3xl p-12 max-w-xl w-full text-center">
        <div className="text-xs font-semibold text-purple-600 mb-3 tracking-widest uppercase">
          Pitch Perfect
        </div>
        <h2 className="text-2xl md:text-3xl display-headline-tight text-slate-900 mb-2">
          Preparing your feedback
        </h2>
        {companyName ? (
          <p className="text-sm text-slate-500 mb-10">For {companyName}</p>
        ) : null}

        {/* Animated waveform */}
        <div className="flex items-end justify-center gap-1.5 h-16 mb-8">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(function (i) {
            return (
              <div
                key={i}
                className="w-1.5 rounded-full bg-purple-500"
                style={{
                  animation: "waveform-pulse 1.4s ease-in-out " + (i * 0.08) + "s infinite",
                  opacity: 0.7,
                }}
              />
            );
          })}
        </div>

        {/* Rotating message with fade */}
        <p
          className="text-lg text-slate-700 leading-relaxed smooth-transition min-h-[3rem]"
          style={{ opacity: fading ? 0 : 1 }}
        >
          {LOADING_MESSAGES[messageIndex]}
        </p>

        <p className="text-xs text-slate-400 mt-6">
          Your feedback is preparing. You can refresh this page to resume it.
        </p>
      </div>

      <style jsx>{`
        @keyframes waveform-pulse {
          0%, 100% {
            height: 8px;
            opacity: 0.4;
          }
          50% {
            height: 56px;
            opacity: 1;
          }
        }
      `}</style>
    </main>
  );
}

export default function PitchResultsPage() {
  const router = useRouter();
  const [pitchData, setPitchData] = useState<PitchData | null>(null);
  const [critique, setCritique] = useState<PitchCritique | null>(null);
  const [partialCritique, setPartialCritique] = useState<Partial<PitchCritique> | null>(null);
  const [error, setError] = useState("");
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const [saveWarning, setSaveWarning] = useState("");
  const [savingPdf, setSavingPdf] = useState(false);
  const [enhancingReport, setEnhancingReport] = useState(false);
  const [insightsError, setInsightsError] = useState("");
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
      reportAccess();

      const cached = sessionStorage.getItem("pitchperfect_critique");
      const cachedTime = sessionStorage.getItem("pitchperfect_generated_at");
      if (cached) {
        setCritique(JSON.parse(cached));
        if (cachedTime) setGeneratedAt(cachedTime);
        if (sessionStorage.getItem("pitchperfect_pdf_saved") !== "true") {
          generateCritique(pd, conv, false, JSON.parse(cached), cachedTime || undefined);
        }
        return () => requestRef.current?.abort();
      }

      generateCritique(pd, conv);
    } catch (e) {
      router.push("/pitch");
    }
    return () => requestRef.current?.abort();
  }, [router]);

  async function generateCritique(pd: PitchData, conv: PitchMessage[], retry = false, existingCritique?: PitchCritique, cachedTime?: string, upgradeAccess?: ReportAccess) {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setSavingPdf(true);
    if (upgradeAccess) { setEnhancingReport(true); setInsightsError(""); }
    try {
      const result = await loadPitchReport(pd, conv, { signal: controller.signal, retry, existingCritique, generatedAt: cachedTime, access: upgradeAccess,
        onProgress: partial => { if (!controller.signal.aborted) setPartialCritique(partial); } });
      if (controller.signal.aborted) return;
      if (upgradeAccess) sessionStorage.setItem("pitchperfect_report_access", JSON.stringify(upgradeAccess));
      setCritique(result.data);
      setPartialCritique(null);
      setGeneratedAt(result.generatedAt);
      setSaveWarning(result.saveWarning || "");
      sessionStorage.setItem("pitchperfect_critique", JSON.stringify(result.data));
      sessionStorage.setItem("pitchperfect_generated_at", result.generatedAt);
      sessionStorage.setItem("pitchperfect_pdf_saved", String(result.pdfSaved));
    } catch (e) {
      if (controller.signal.aborted) return;
      const message = e instanceof Error ? e.message : "Something went wrong. Please try again.";
      if (upgradeAccess) { setPartialCritique(null); setInsightsError(message); }
      else if (existingCritique) setSaveWarning("Your report is ready, but its PDF copy has not saved yet. Please retry saving.");
      else setError(message);
    } finally {
      if (!controller.signal.aborted) { setSavingPdf(false); if (upgradeAccess) setEnhancingReport(false); }
    }
  }

  async function handleDownloadPdf() {
    if (!pitchData || !critique) return;
    setDownloadingPdf(true);
    try {
      const res = await fetch("/api/generate-pitch-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sessionStorage.getItem("pitchperfect_pdf_saved") === "true"
          ? reportAccess() : { pitchData, critique, generatedAt }),
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

  if (error && !critique && !partialCritique) {
    return (
      <main className="min-h-screen mesh-bg-pitch flex items-center justify-center px-6">
        <div className="glass-card-strong rounded-3xl p-10 max-w-md text-center">
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
                  generateCritique(JSON.parse(dataStr), JSON.parse(convStr), true);
                } else {
                  router.push("/pitch");
                }
              }}
              className="px-6 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 font-medium smooth-transition"
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

  if (!critique && !partialCritique) {
    return <LoadingState companyName={pitchData?.companyName || ""} />;
  }

  const report: Partial<PitchCritique> = { ...critique, ...partialCritique };

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
            disabled={downloadingPdf || savingPdf || !critique}
            className="px-6 py-3 bg-white border-2 border-purple-300 text-purple-700 rounded-xl hover:bg-purple-50 font-medium disabled:opacity-40"
          >
            {savingPdf || !critique ? "Preparing complete PDF..." : downloadingPdf ? "Building PDF..." : "Download as PDF"}
          </button>
        </div>

        {savingPdf ? <div role="status" className="mb-6 rounded-xl border border-purple-200 bg-purple-50 p-4 text-sm text-purple-900">
          <p className="font-semibold mb-1">Report in progress</p>
          <p>Read each section as it arrives. Your verdict and strengths come first, followed by fixes and next steps. Market research is being prepared separately. The complete PDF will be available when everything is ready.</p>
        </div> : null}
        {error ? <div role="alert" className="mb-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          <p>{error}</p>
          <p className="mt-1">The feedback shown so far and your conversation are saved.</p>
          <button disabled={savingPdf} className="mt-2 font-semibold underline disabled:opacity-50" onClick={() => {
            setError("");
            const conversation = sessionStorage.getItem("pitchperfect_conversation");
            if (pitchData && conversation) generateCritique(pitchData, JSON.parse(conversation), true);
          }}>Resume report</button>
        </div> : null}

        {saveWarning ? (
          <div role="alert" className="mb-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
            <p>{saveWarning}</p>
            <button disabled={savingPdf} className="mt-2 font-semibold underline disabled:opacity-50" onClick={() => {
              const conversation = sessionStorage.getItem("pitchperfect_conversation");
              if (pitchData && conversation && critique) generateCritique(pitchData, JSON.parse(conversation), false, critique, generatedAt);
            }}>{savingPdf ? "Saving PDF..." : "Retry saving PDF"}</button>
          </div>
        ) : null}

        {report.verdict !== undefined ? <section className="bg-purple-50 border-l-4 border-purple-600 rounded-r-2xl p-6 mb-8">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-purple-700">
              Verdict
            </div>
            {report.verdictCategory ? (
              <VerdictBadge category={report.verdictCategory} />
            ) : null}
          </div>
          <p className="text-lg text-slate-800 leading-relaxed">
            {report.verdict}
          </p>
        </section> : null}

        {report.strong || report.weak ? <div className="grid md:grid-cols-2 gap-6 mb-8">
          {report.strong ? <section className="bg-white rounded-2xl p-6 border border-green-200 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wider text-green-700 mb-3">
              What's strong
            </div>
            <ul className="space-y-3">
              {report.strong.map(function (item, i) {
                return (
                  <li key={i} className="text-sm text-slate-700 flex gap-2">
                    <span className="text-green-500 mt-0.5">✓</span>
                    <span>{item}</span>
                  </li>
                );
              })}
            </ul>
          </section> : null}

          {report.weak ? <section className="bg-white rounded-2xl p-6 border border-amber-200 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wider text-amber-700 mb-3">
              What's weak
            </div>
            <ul className="space-y-3">
              {report.weak.map(function (item, i) {
                return (
                  <li key={i} className="text-sm text-slate-700 flex gap-2">
                    <span className="text-amber-500 mt-0.5">!</span>
                    <span>{item}</span>
                  </li>
                );
              })}
            </ul>
          </section> : null}
        </div> : null}

        {report.fatalFlaw ? (
          <section className="bg-red-50 border-2 border-red-300 rounded-2xl p-6 mb-8">
            <div className="text-xs font-semibold uppercase tracking-wider text-red-700 mb-2">
              The fatal flaw
            </div>
            <p className="text-base text-red-900 leading-relaxed font-medium">
              {report.fatalFlaw}
            </p>
          </section>
        ) : null}

        {report.sectorConcerns && report.sectorConcerns.length > 0 ? (
          <section className="bg-white rounded-2xl p-6 mb-8 border border-slate-200 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-3">
              Sector specific concerns
            </div>
            <ul className="space-y-2">
              {report.sectorConcerns.map(function (item, i) {
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

        {report.revisedPitch !== undefined ? <section className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl p-7 mb-8 border border-purple-200">
          <div className="text-xs font-semibold uppercase tracking-wider text-purple-700 mb-3">
            How I would tell this story
          </div>
          <p className="text-base text-slate-800 leading-relaxed italic">
            "{report.revisedPitch}"
          </p>
        </section> : null}

        {report.thirtyDayActions ? <section className="bg-white rounded-2xl p-6 mb-8 border border-slate-200 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-3">
            What to do in the next 30 days
          </div>
          <ol className="space-y-3 list-decimal list-inside">
            {report.thirtyDayActions.map(function (item, i) {
              return (
                <li key={i} className="text-sm text-slate-700 leading-relaxed pl-1">
                  {item}
                </li>
              );
            })}
          </ol>
        </section> : null}

        {report.vcQuestions ? <section className="bg-white rounded-2xl p-6 mb-8 border border-slate-200 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-4">
            Questions a real VC will ask, prepare for these
          </div>
          <div className="space-y-4">
            {report.vcQuestions.map(function (q, i) {
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
        </section> : null}

        <ReportInsights critique={report} />
        {critique && (critique.aiOpportunities === undefined || !critique.marketResearch) ? <section className="rounded-2xl bg-purple-50 border border-purple-200 p-6 mb-8">
          <h2 className="font-semibold text-slate-900 mb-2">Add practical AI advice and a market check</h2>
          <p className="text-sm text-slate-600 mb-4">Use your saved conversation to add business-specific AI pilots and current competitor research. Your existing report stays available while these prepare.</p>
          <button disabled={savingPdf || enhancingReport} className="rounded-xl bg-purple-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50" onClick={() => {
            const conversation = sessionStorage.getItem("pitchperfect_conversation");
            if (pitchData && conversation) generateCritique(pitchData, JSON.parse(conversation), true, undefined, undefined,
              reportAccess("pitchperfect_insights_access"));
          }}>{enhancingReport ? "Adding AI and market insights..." : "Add AI and market insights"}</button>
          {insightsError ? <p role="alert" className="text-sm text-red-700 mt-3">{insightsError}</p> : null}
        </section> : null}

        {generatedAt && !savingPdf ? (
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
