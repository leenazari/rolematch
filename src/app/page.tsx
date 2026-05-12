"use client";

import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen mesh-bg-pitch px-6 py-16 flex flex-col items-center justify-center">
      <div className="max-w-5xl mx-auto w-full">
        <div className="text-center mb-16">
          <div className="text-sm font-semibold text-slate-500 mb-4 tracking-widest uppercase">
            Innovation13
          </div>
          <h1 className="text-5xl md:text-7xl display-headline text-slate-900 mb-6">
            Two tools to help you go further.
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Pick the one that fits where you are right now.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {/* RoleMatch card (unchanged from before) */}
          <Link
            href="/career"
            className="group block bg-white rounded-3xl p-8 border border-slate-200 hover:border-indigo-400 hover:shadow-2xl hover:shadow-indigo-200 smooth-transition"
          >
            <div className="text-xs font-semibold text-indigo-600 mb-3 tracking-widest uppercase">
              For your career
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-3">
              RoleMatch
            </h2>
            <p className="text-slate-600 mb-6 leading-relaxed">
              Find roles that fit, not just roles that exist. Upload your CV, have a conversation about what you actually want, get five personalised role recommendations.
            </p>
            <div className="text-indigo-600 font-medium group-hover:translate-x-1 smooth-transition inline-flex items-center gap-1">
              Find my next move
              <span className="text-lg">→</span>
            </div>
          </Link>

          {/* Pitch Perfect card (refreshed) */}
          <Link
            href="/pitch"
            className="group block relative rounded-3xl p-8 smooth-transition overflow-hidden"
            style={{
              background: "linear-gradient(135deg, rgba(168, 85, 247, 0.08), rgba(99, 102, 241, 0.05))",
              border: "1px solid rgba(168, 85, 247, 0.2)",
            }}
          >
            <div
              className="absolute inset-0 opacity-0 group-hover:opacity-100 smooth-transition pointer-events-none"
              style={{
                background: "linear-gradient(135deg, rgba(168, 85, 247, 0.15), rgba(99, 102, 241, 0.1))",
                boxShadow: "0 30px 60px -20px rgba(168, 85, 247, 0.3)",
              }}
            />
            <div className="relative">
              <div className="text-xs font-semibold text-purple-600 mb-3 tracking-widest uppercase">
                For your business
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-3">
                Pitch Perfect
              </h2>
              <p className="text-slate-600 mb-6 leading-relaxed">
                Pitch your business to an AI investor. Have a friendly conversation about your seed-stage company, get an honest written breakdown of what's strong, what's weak, and what to fix.
              </p>
              <div className="text-purple-600 font-medium group-hover:translate-x-1 smooth-transition inline-flex items-center gap-1">
                Pitch my business
                <span className="text-lg">→</span>
              </div>
            </div>
          </Link>
        </div>

        <p className="text-center text-xs text-slate-400 mt-12">
          No accounts. No spam. Your session ends when you close the tab.
        </p>
      </div>
    </main>
  );
}
