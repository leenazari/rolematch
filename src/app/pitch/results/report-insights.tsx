import type { PitchCritique } from "@/types";

function safeLink(url: string) {
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed.href : null;
  } catch { return null; }
}

export function ReportInsights({ critique }: { critique: PitchCritique }) {
  const market = critique.marketResearch;
  const sources = new Map((market?.sources || []).filter(source => safeLink(source.url)).map(source => [source.url, source.title]));
  return <>
    {critique.aiOpportunities?.length ? <section className="bg-white rounded-2xl p-6 mb-8 border border-purple-200 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900 mb-2">Where AI could help your business</h2>
      <p className="text-sm text-slate-500 mb-5">Practical pilots based on the business you described.</p>
      <div className="space-y-6">{critique.aiOpportunities.map((opportunity, i) => <article key={i} className="border-l-2 border-purple-300 pl-4">
        <h3 className="font-semibold text-purple-800 mb-2">{opportunity.businessArea}</h3>
        <p className="text-sm text-slate-600 mb-3">{opportunity.pitchEvidence}</p>
        <dl className="space-y-2 text-sm text-slate-700">
          {[["How AI could help", opportunity.workflow], ["First step", opportunity.firstStep],
            ["How to measure it", opportunity.successMeasure], ["Human check", opportunity.humanCheck]].map(([label, value]) =>
            <div key={label}><dt className="font-semibold text-slate-900">{label}</dt><dd className="leading-relaxed">{value}</dd></div>)}
        </dl>
      </article>)}</div>
    </section> : null}
    {market ? <section className="bg-white rounded-2xl p-6 mb-8 border border-slate-200 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900 mb-2">Market and competitors</h2>
      <p className="text-xs text-slate-500 mb-3">{market.scope}{market.checkedAt ? " · Checked " + new Date(market.checkedAt).toLocaleDateString("en-GB") : ""}</p>
      <p className="text-sm text-slate-700 leading-relaxed mb-5">{market.summary}</p>
      <div className="space-y-5">{market.competitors.map((competitor, i) => <article key={i} className="rounded-xl border border-slate-200 p-4">
        <h3 className="font-semibold text-slate-900 mb-2">{competitor.name}</h3>
        <p className="text-sm text-slate-700 mb-2">{competitor.offering}</p>
        <p className="text-sm text-slate-600 mb-2"><strong className="text-slate-800">Why they overlap: </strong>{competitor.overlap}</p>
        <p className="text-sm text-slate-600"><strong className="text-slate-800">A difference to test: </strong>{competitor.differenceToTest}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">{competitor.sourceUrls.filter(url => sources.has(url)).map(url =>
          <a key={url} href={safeLink(url)!} target="_blank" rel="noopener noreferrer" className="text-xs text-purple-700 underline">{sources.get(url)}</a>)}</div>
      </article>)}</div>
      {market.nextSteps.length ? <div className="mt-5"><h3 className="font-semibold text-slate-900 mb-2">What to check next</h3>
        <ul className="list-disc pl-5 space-y-2 text-sm text-slate-700">{market.nextSteps.map((step, i) => <li key={i}>{step}</li>)}</ul>
      </div> : null}
      {sources.size ? <div className="mt-5"><h3 className="text-xs font-semibold text-slate-600 mb-2">Sources</h3>
        <div className="flex flex-wrap gap-x-4 gap-y-2">{Array.from(sources).map(([url, title]) =>
          <a key={url} href={safeLink(url)!} target="_blank" rel="noopener noreferrer" className="text-xs text-purple-700 underline">{title}</a>)}</div>
      </div> : null}
      <p className="text-xs text-slate-500 leading-relaxed mt-5">{market.limitations}</p>
    </section> : null}
  </>;
}
