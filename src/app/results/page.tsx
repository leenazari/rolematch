"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CVData, Message, ResultsData, RoleMatch } from "@/types";

const CATEGORY_TITLES = {
  pivot: "Roles you might not have considered",
  stretch: "Roles worth growing into",
  strong: "Roles you could walk into",
};

const CATEGORY_BLURBS = {
  pivot: "Lateral moves into different sectors where your skills transfer in unexpected ways.",
  stretch: "Slightly above your current level or in adjacent sectors. Realistic with some growth.",
  strong: "Direct fits based on your experience and what you told us you want.",
};

export default function ResultsPage() {
  const router = useRouter();
  const [cvData, setCvData] = useState<CVData | null>(null);
  const [conversation, setConversation] = useState<Message[]>([]);
  const [results, setResults] = useState<ResultsData | null>(null);
  const [error, setError] = useState("");
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  useEffect(() => {
    const cvStr = sessionStorage.getItem("rolematch_cv");
    const convStr = sessionStorage.getItem("rolematch_conversation");
    if (!cvStr || !convStr) {
      router.push("/");
      return;
    }
    try {
      const cv = JSON.parse(cvStr) as CVData;
      const conv = JSON.parse(convStr) as Message[];
      setCvData(cv);
      setConversation(conv);

      const cached = sessionStorage.getItem("rolematch_results");
      if (cached) {
        setResults(JSON.parse(cached));
        return;
      }

      generateResults(cv, conv);
    } catch {
      router.push("/");
    }
  }, [router]);

  async function generateResults(cv: CVData, conv: Message[]) {
    try {
      const res = await fetch("/api/generate-results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cvData: cv, conversation: conv }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || "Could not generate results.");
        return;
      }
      setResults(json.data);
      sessionStorage.setItem("rolematch_results", JSON.stringify(json.data));
    } catch (e: any) {
      setError("Something went wrong. Please refresh to try again.");
    }
  }

  async function handleDownloadPdf() {
    if (!cvData || !results) return;
    setDownloadingPdf(true);
    try {
      const res = await fetch("/api/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cvData, results }),
      });
      if (!res.ok) {
        setError("PDF download failed. Please try again.");
        setDownloadingPdf(false);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = cvData.name.replace(/[^a-zA-Z0-9]+/g, "_");
      a.download = `RoleMatch_${safeName}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
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
          <button onClick={() => router.push("/")} className="text-indigo-600 underline">
            Start over
          </button>
        </div>
      </main>
    );
  }

  if (!results) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <div className="inline-block w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-6"></div>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Generating your recommendations</h2>
          <p className="text-slate-600">This usually takes about thirty seconds. Hang tight.</p>
        </div>
      </main>
    );
  }

  const groupedRoles = {
    pivot: results.roles.filter((r) => r.category === "pivot"),
    stretch: results.roles.filter((r) => r.category === "stretch"),
    strong: results.roles.filter((r) => r.category === "strong"),
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 px-6 py-12">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="text-sm font-semibold text-indigo-600 mb-3 tracking-widest uppercase">
            RoleMatch
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4 tracking-tight">
            Your career direction
          </h1>
          {cvData && (
            <p className="text-slate-600">For {cvData.name}</p>
          )}
        </div>

        {/* Download button */}
        <div className="flex justify-center mb-10">
          <button
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
            className="px-6 py-3 bg-white border-2 border-indigo-300 text-indigo-700 rounded-xl hover:bg-indigo-50 font-medium disabled:opacity-40"
          >
            {downloadingPdf ? "Building PDF..." : "Download as PDF"}
          </button>
        </div>

        {/* Summary */}
        <div className="bg-indigo-50 border-l-4 border-indigo-600 rounded-r-2xl p-6 mb-10">
          <div className="text-xs font-semibold uppercase tracking-wider text-indigo-700 mb-2">
            What we heard from you
          </div>
          <p className="text-lg text-slate-800 leading-relaxed">
            {results.summary}
          </p>
        </div>

        {/* Pivot */}
        <RoleSection
          category="pivot"
          roles={groupedRoles.pivot}
        />

        {/* Stretch */}
        <RoleSection
          category="stretch"
          roles={groupedRoles.stretch}
        />

        {/* Strong */}
        <RoleSection
          category="strong"
          roles={groupedRoles.strong}
        />

        {/* Salary caveat */}
        <p className="text-xs text-slate-400 italic text-center mt-8 max-w-2xl mx-auto">
          Salary ranges are estimates based on UK averages and can vary by region, employer, and your specific background. Use them as a guide, not a guarantee.
        </p>

        {/* Interviewa CTA */}
        <div className="mt-12 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-3xl p-10 text-center shadow-xl shadow-indigo-200">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
            Ready to practise interviewing for these roles?
          </h2>
          <p className="text-indigo-100 mb-6 max-w-xl mx-auto">
            RoleMatch is part of Interviewa. Practise real interviews with our AI interviewer, get instant feedback, and walk in confident on the day.
          </p>
          
            href="https://interviewa.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block px-8 py-4 bg-white text-indigo-700 rounded-2xl font-semibold hover:bg-indigo-50 shadow-lg"
          >
            Try Interviewa
          </a>
        </div>

        {/* Restart */}
        <div className="text-center mt-8">
          <button
            onClick={() => {
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

type RoleSectionProps = {
  category: "pivot" | "stretch" | "strong";
  roles: RoleMatch[];
};

function RoleSection(props: RoleSectionProps) {
  const { category, roles } = props;
  if (roles.length === 0) return null;

  return (
    <section className="mb-10">
      <div className="mb-5 px-2">
        <h2 className="text-xl md:text-2xl font-bold text-slate-900 mb-1">
          {CATEGORY_TITLES[category]}
        </h2>
        <p className="text-sm text-slate-500">{CATEGORY_BLURBS[category]}</p>
      </div>

      <div className="space-y-4">
        {roles.map((role, idx) => (
          <RoleCard key={`${category}-${idx}`} role={role} />
        ))}
      </div>
    </section>
  );
}

function RoleCard(props: { role: RoleMatch }) {
  const { role } = props;
  const isPivot = role.category === "pivot";

  return (
    <div className="bg-white rounded-2xl p-6 md:p-7 border border-slate-200 shadow-sm">
      <h3 className="text-2xl font-bold text-slate-900 mb-3">{role.title}</h3>

      {isPivot && role.whyUnexpected && (
        <div className="bg-purple-50 border-l-4 border-purple-400 rounded-r-lg px-4 py-3 mb-4">
          <p className="text-sm text-purple-900">
            <span className="font-semibold">Why this could fit: </span>
            {role.whyUnexpected}
          </p>
        </div>
      )}

      <p className="text-slate-700 leading-relaxed mb-5">
        {role.consultantParagraph}
      </p>

      <div className="grid md:grid-cols-2 gap-5 mb-5">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
            What you bring
          </div>
          <ul className="space-y-1">
            {role.yourStrengths.map((s, i) => (
              <li key={i} className="text-sm text-slate-700 flex items-start gap-2">
                <span className="text-indigo-500 mt-0.5">•</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
            What to develop
          </div>
          <ul className="space-y-1">
            {role.developmentGaps.map((g, i) => (
              <li key={i} className="text-sm text-slate-700 flex items-start gap-2">
                <span className="text-amber-500 mt-0.5">•</span>
                <span>{g}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-5">
        <div className="text-xs font-semibold uppercase tracking-wider text-amber-800 mb-1">
          Suggested next step
        </div>
        <p className="text-sm text-amber-900">{role.nextStep}</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {(["entry", "established", "senior"] as const).map((tier) => {
          const isActive = role.salary.startingTier === tier;
          return (
            <div
              key={tier}
              className={`rounded-lg p-3 ${
                isActive
                  ? "bg-indigo-50 border-2 border-indigo-500"
                  : "bg-slate-50 border border-slate-200"
              }`}
            >
              <div
                className={`text-xs uppercase tracking-wider font-semibold mb-1 ${
                  isActive ? "text-indigo-700" : "text-slate-500"
                }`}
              >
                {tier}
              </div>
              <div className="text-base font-bold text-slate-900">
                {role.salary[tier]}
              </div>
              {isActive && (
                <div className="text-xs text-indigo-600 font-semibold mt-1">
                  YOU START HERE
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
