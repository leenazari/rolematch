"use client";

import { pitchStore } from "@/lib/pitch-browser-store";
import { recoverPitchSession, savedPitchSession, persistPitchSession } from "@/lib/pitch-session-client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { loadPitchReport, reportAccess, newReportAccess, claimReportView, ReportClosedError, type CompletedReport, type ReportAccess } from "@/lib/pitch-report-client";
import { ReportInsights } from "./report-insights";
import { ReportLoadingScreen, ReportProgressNotice } from "./report-preparation";
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

export default function PitchResultsPage() {
  const router = useRouter();
  const [pitchData, setPitchData] = useState<PitchData | null>(null);
  const [critique, setCritique] = useState<PitchCritique | null>(null);
  const [partialCritique, setPartialCritique] = useState<Partial<PitchCritique> | null>(null);
  const [loadVersion, setLoadVersion] = useState(0);
  const [error, setError] = useState("");
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const [saveWarning, setSaveWarning] = useState("");
  const [savingPdf, setSavingPdf] = useState(false);
  const [enhancingReport, setEnhancingReport] = useState(false);
  const [insightsError, setInsightsError] = useState("");
  const [generatedAt, setGeneratedAt] = useState<string>("");

  const conversationRef = useRef<PitchMessage[]>([]);
  const openAccess = useRef<ReportAccess | null>(null);
  const pairedTokens = useRef(new Map<string, ReportAccess>());
  const upgradeRef = useRef<ReportAccess | null>(null);
  const archivedPdf = useRef(false);
  const pendingView = useRef<{ access: ReportAccess; result: CompletedReport } | null>(null);
  const [closed, setClosed] = useState(false);
  const [downloadStarted, setDownloadStarted] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  // Discard a restored back/forward snapshot too. It must not reopen an old results view.
  useEffect(() => {
    const restored = (event: PageTransitionEvent) => { if (event.persisted && openAccess.current) window.location.reload(); };
    if (typeof window === "undefined") return;
    window.addEventListener("pageshow", restored);
    return () => window.removeEventListener("pageshow", restored);
  }, []);
  useEffect(() => {
    if (!critique || downloadStarted || closed || typeof window === "undefined") return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [critique, downloadStarted, closed]);

  const [takingLonger, setTakingLonger] = useState(false);
  const waitingForReport = !critique && !error;
  useEffect(() => {
    if (!waitingForReport) { setTakingLonger(false); return; }
    const timer = setTimeout(() => setTakingLonger(true), 120_000);
    return () => clearTimeout(timer);
  }, [waitingForReport]);

  useEffect(() => {
    let active = true;
    async function restoreResults() {
      try {
        let dataStr = pitchStore.getItem("pitchperfect_data");
        let convStr = pitchStore.getItem("pitchperfect_conversation");
        if (!dataStr || !convStr || savedPitchSession()) {
          const recovered = await recoverPitchSession();
          if (!active) return;
          if (recovered) {
            if (!recovered.state.finished) { router.push("/pitch/conversation"); return; }
            await persistPitchSession(recovered);
            dataStr = JSON.stringify(recovered.state.pitchData); convStr = JSON.stringify(recovered.state.messages);
          } else if (!pitchStore.getItem("pitchperfect_report_access")) { setClosed(true); return; }
        }
        if (!active) return;
        if (!dataStr || !convStr) {
          if (!pitchStore.getItem("pitchperfect_report_access")) { setClosed(true); return; }
          throw new Error("Your report could not be loaded. Retry to reconnect to your pitch.");
        }
        const pd = JSON.parse(dataStr), conv = JSON.parse(convStr);
        if (!pd?.companyName || !Array.isArray(conv) || !conv.length) throw new Error("Your saved pitch could not be opened. Please retry.");
        setPitchData(pd); conversationRef.current = conv;
        let cached = null;
        try { cached = JSON.parse(pitchStore.getItem("pitchperfect_critique") || "null"); } catch { pitchStore.removeItem("pitchperfect_critique"); }
        const cachedTime = pitchStore.getItem("pitchperfect_generated_at");
        if (cached && typeof cached.verdict === "string" && Array.isArray(cached.strong) && Array.isArray(cached.weak)) {
          generateCritique(pd, conv, false, cached, cachedTime || undefined);
        } else generateCritique(pd, conv);
      } catch (failure) {
        if (active) setError(failure instanceof Error ? failure.message : "Your saved pitch could not be loaded. Please retry.");
      }
    }
    restoreResults();
    return () => { active = false; requestRef.current?.abort(); };
  }, [router, loadVersion]);

  async function generateCritique(pd: PitchData, conv: PitchMessage[], retry = false, existingCritique?: PitchCritique, cachedTime?: string, upgradeAccess?: ReportAccess) {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setSavingPdf(true);
    if (upgradeAccess) { setEnhancingReport(true); setInsightsError(""); }
    try {
      const access = upgradeAccess || openAccess.current || reportAccess();
      const pending = pendingView.current;
      const result = pending?.access.reportId === access.reportId && pending.access.accessToken === access.accessToken
        ? pending.result : await loadPitchReport(pd, conv, { signal: controller.signal, retry, existingCritique, generatedAt: cachedTime, access,
        onProgress: partial => { if (!controller.signal.aborted) setPartialCritique(partial); } });
      if (controller.signal.aborted) return;
      if (access !== openAccess.current) {
        pendingView.current = { access, result };
        // Keep the same proposed credential for a retry after a lost acknowledgement.
        let view = pairedTokens.current.get(access.reportId);
        if (!view) {
          view = { reportId: access.reportId, accessToken: newReportAccess().accessToken };
          pairedTokens.current.set(access.reportId, view);
        }
        const claimed = await claimReportView(access, view);
        if (controller.signal.aborted) return;
        if (claimed === "closed") { pitchStore.clear(); setClosed(true); return; }
        openAccess.current = view;
        pitchStore.clear();
      }
      pendingView.current = null;
      archivedPdf.current = result.pdfSaved;
      setCritique(result.data);
      setPartialCritique(null);
      setGeneratedAt(result.generatedAt);
      setSaveWarning(result.saveWarning || "");
      setDownloadStarted(false);
    } catch (e) {
      if (controller.signal.aborted) return;
      const message = e instanceof Error ? e.message : "Something went wrong. Please try again.";
      if (e instanceof ReportClosedError) { pitchStore.clear(); setClosed(true); }
      else if (upgradeAccess) { setPartialCritique(null); setInsightsError(message); }
      else if (existingCritique && openAccess.current) setSaveWarning("Your report is ready, but its PDF copy has not saved yet. Please retry saving.");
      else setError(message);
    } finally {
      if (!controller.signal.aborted) { setSavingPdf(false); if (upgradeAccess) setEnhancingReport(false); }
    }
  }

  async function handleDownloadPdf() {
    if (!pitchData || !critique) return;
    setDownloadError(""); setDownloadingPdf(true);
    try {
      const res = await fetch("/api/generate-pitch-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(archivedPdf.current && openAccess.current
          ? openAccess.current : { pitchData, critique, generatedAt }),
      });
      if (!res.ok) {
        setDownloadError("The PDF didn’t download. Keep this page open and try again.");
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
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setDownloadStarted(true);
    } catch (e) {
      setDownloadError("The PDF didn’t download. Keep this page open and try again.");
    } finally {
      setDownloadingPdf(false);
    }
  }

  if (closed) return <main className="min-h-screen mesh-bg-pitch grid place-items-center px-5">
    <section className="glass-card-strong max-w-md rounded-3xl p-8 text-center">
      <h1 className="text-2xl font-bold text-slate-900">No report is available here</h1>
      <p className="mt-3 text-slate-700">A completed report can only be viewed on the page where you first opened it. If you downloaded your PDF, check your downloads.</p>
      <a className="mt-5 inline-block font-semibold text-purple-700 underline" href="/pitch">Start a new pitch</a>
    </section>
  </main>;

  if (error && !critique && !partialCritique) {
    return (
      <main className="min-h-screen mesh-bg-pitch flex items-center justify-center px-6">
        <div className="glass-card-strong rounded-3xl p-10 max-w-md text-center">
          <h1 className="text-2xl font-bold text-slate-900 mb-4">Something went wrong</h1>
          <p className="text-slate-600 mb-6">{error}</p>
          <p className="text-sm text-slate-500 mb-6">Saved answers are kept while you retry.</p>
          <div className="flex flex-col gap-3 items-center">
            <button
              onClick={function () {
                setError("");
                const dataStr = pitchStore.getItem("pitchperfect_data");
                const convStr = pitchStore.getItem("pitchperfect_conversation");
                if (dataStr && convStr) {
                  try { generateCritique(JSON.parse(dataStr), JSON.parse(convStr), true); }
                  catch { setLoadVersion(value => value + 1); }
                } else {
                  setLoadVersion(value => value + 1);
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
    return <ReportLoadingScreen company={pitchData?.companyName} takingLonger={takingLonger} />;
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

        <section id="download-report" aria-labelledby="download-title" className="mb-8 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-center">
          <h2 id="download-title" className="text-lg font-semibold text-slate-900">Download your report before you leave</h2>
          <p className="mt-1 text-sm text-slate-700">{critique
            ? "Once you leave or refresh this page, you won’t be able to reopen your results. Download the PDF to keep a copy."
            : "Your full PDF will appear here when it’s ready. Download it before leaving the completed report."}</p>
          <button onClick={handleDownloadPdf} disabled={downloadingPdf || savingPdf || !critique}
            className="mt-4 rounded-xl bg-purple-700 px-6 py-3 font-semibold text-white hover:bg-purple-800 disabled:opacity-50">
            {savingPdf || !critique ? "Preparing complete PDF..." : downloadingPdf ? "Preparing download..." : "Download full PDF"}
          </button>
          {downloadError ? <p role="alert" className="mt-2 text-sm text-red-800">{downloadError}</p> : null}
          {downloadStarted ? <p role="status" className="mt-2 text-sm text-slate-700">Download started. Check that the PDF is on your device before leaving.</p> : null}
        </section>

        {savingPdf && <ReportProgressNotice takingLonger={takingLonger} complete={!!critique} enhancing={enhancingReport} />}
        {error ? <div role="alert" className="mb-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          <p>{error}</p>
          <p className="mt-1">The feedback shown so far and your conversation are saved.</p>
          <button disabled={savingPdf} className="mt-2 font-semibold underline disabled:opacity-50" onClick={() => {
            setError("");
            if (pitchData) generateCritique(pitchData, conversationRef.current, true);
          }}>Resume report</button>
        </div> : null}

        {saveWarning ? (
          <div role="alert" className="mb-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
            <p>{saveWarning}</p>
            <button disabled={savingPdf} className="mt-2 font-semibold underline disabled:opacity-50" onClick={() => {
              if (pitchData && critique) generateCritique(pitchData, conversationRef.current, false, critique, generatedAt);
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
            if (!upgradeRef.current) upgradeRef.current = newReportAccess();
            if (pitchData) generateCritique(pitchData, conversationRef.current, true, undefined, undefined, upgradeRef.current);
          }}>{enhancingReport ? "Adding AI and market insights..." : "Add AI and market insights"}</button>
          {insightsError ? <p role="alert" className="text-sm text-red-700 mt-3">{insightsError}</p> : null}
        </section> : null}

        {generatedAt && !savingPdf ? (
          <p className="text-xs text-slate-400 text-center mt-3">
            Generated: {formatTimestamp(generatedAt)}
          </p>
        ) : null}

        <div className="text-center mt-12">
          {critique && <a href="#download-report" className="mb-4 block font-semibold text-purple-700 underline">Back to PDF download</a>}
          <button
            onClick={function () {
              if (critique && !downloadStarted && !window.confirm("Leave without downloading? You won’t be able to reopen this report.")) return;
              pitchStore.clear();
              router.push("/pitch");
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
