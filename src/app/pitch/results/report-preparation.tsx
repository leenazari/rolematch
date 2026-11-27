/** An indeterminate illustration: the marks are decorative, not progress milestones. */
export function ReportMark({ small = false }: { small?: boolean }) {
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 140 116"
    className={small ? "w-14 h-12 flex-none" : "w-40 h-auto mx-auto"}>
    <ellipse cx="70" cy="104" rx="34" ry="4" fill="#ede9fe" />
    <circle cx="70" cy="55" r="49" fill="#f5f3ff" />
    <path d="M45 26 L87 18 Q91 17 92 22 L103 81 Q104 87 99 88 L54 96 Q49 97 48 92 L38 34 Q37 28 45 26Z" fill="#ddd6fe" />
    <path d="M51 20 H80 L96 36 V87 Q96 94 89 94 H51 Q44 94 44 87 V27 Q44 20 51 20Z" fill="white" stroke="#7c3aed" strokeWidth="2.4" strokeLinejoin="round" />
    <path d="M80 21 V31 Q80 36 85 36 H95" fill="#ede9fe" stroke="#7c3aed" strokeWidth="2" strokeLinejoin="round" />
    <g fill="none" strokeLinecap="round" strokeWidth="3">
      <path d="M55 38 H69" stroke="#7c3aed" />
      <path d="M55 50 H84 M55 61 H78 M55 72 H84" stroke="#ede9fe" />
      <path className="pitch-report-ink" pathLength="1" d="M55 50 H84" stroke="#8b5cf6" />
      <path className="pitch-report-ink pitch-report-ink-2" pathLength="1" d="M55 61 H78" stroke="#a78bfa" />
      <path className="pitch-report-ink pitch-report-ink-3" pathLength="1" d="M55 72 H84" stroke="#8b5cf6" />
    </g>
  </svg>;
}

export function ReportLoadingScreen({ company, takingLonger }: { company?: string; takingLonger: boolean }) {
  return <main className="min-h-screen mesh-bg-pitch flex items-center justify-center px-5 py-12">
    <section aria-labelledby="pitch-report-heading" className="glass-card-strong w-full max-w-lg text-center rounded-3xl px-6 py-9 sm:px-12 sm:py-11 shadow-xl shadow-violet-100/70">
      <p className="text-xs font-semibold tracking-widest uppercase text-purple-700">Pitch Perfect</p>
      <div className="my-5"><ReportMark /></div>
      <h1 id="pitch-report-heading" className="display-headline-tight text-3xl sm:text-4xl text-slate-900">Preparing your pitch report</h1>
      {company && <p className="mt-2 text-sm text-slate-600 break-words">For {company}</p>}
      <div role="status" className="mt-6">
        <p className="text-base font-semibold text-slate-800">{takingLonger
          ? "This report is taking a little longer than usual."
          : "Your full report usually takes less than two minutes."}</p>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-600">Your verdict appears first. You can start reading while we finish your recommendations and PDF.</p>
      </div>
      {company && <p className="mt-6 border-t border-purple-100 pt-4 text-xs text-slate-600">You can refresh while your report is preparing. Once it’s ready, download your PDF before leaving.</p>}
    </section>
  </main>;
}

export function ReportProgressNotice({ takingLonger, complete, enhancing }: { takingLonger: boolean; complete: boolean; enhancing: boolean }) {
  return <div role="status" className="mb-6 flex items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm text-slate-700">
    <ReportMark small />
    <div>
      <p className="mb-1 font-semibold text-violet-900">{enhancing ? "Adding AI and market research" : complete ? "Saving your PDF" : "Report in progress"}</p>
      <p>{complete ? "You can keep reading your feedback here." : takingLonger
        ? "The rest is taking a little longer. You can read the sections below while we finish."
        : "You can start reading now. The remaining sections and your PDF will appear here as they’re ready."}</p>
    </div>
  </div>;
}
