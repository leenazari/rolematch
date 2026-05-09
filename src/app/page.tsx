"use client";

import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 px-6 py-16">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <div className="text-sm font-semibold text-indigo-600 mb-3 tracking-widest uppercase">
            RoleMatch
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4 tracking-tight leading-tight">
            What are you trying to figure out?
          </h1>
          <p className="text-lg text-slate-600 max-w-xl mx-auto">
            Two AI conversations to help you think clearly about what's next.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">

          <Link href="/career" className="group">
            <div className="bg-white rounded-3xl p-8 border border-slate-200 hover:border-indigo-400 hover:shadow-xl hover:shadow-indigo-100 transition-all h-full flex flex-col">
              <div className="text-5xl mb-5">🧭</div>
              <h2 className="text-2xl font-bold text-slate-900 mb-3 group-hover:text-indigo-700">
                Career Direction
              </h2>
              <p className="text-slate-600 mb-6 flex-1">
                Upload your CV and have a guided conversation about what you actually want from your next move. You'll get five role suggestions including some you haven't thought of.
              </p>
              <div className="text-xs text-slate-400 mb-4">
                Around 10 minutes. Voice-led conversation.
              </div>
              <div className="inline-flex items-center text-indigo-600 font-semibold group-hover:gap-3 gap-2 transition-all">
                Start career conversation
                <span>→</span>
              </div>
            </div>
          </Link>

          <Link href="/pitch" className="group">
            <div className="bg-white rounded-3xl p-8 border border-slate-200 hover:border-purple-400 hover:shadow-xl hover:shadow-purple-100 transition-all h-full flex flex-col">
              <div className="text-5xl mb-5">🎯</div>
              <h2 className="text-2xl font-bold text-slate-900 mb-3 group-hover:text-purple-700">
                Pitch Perfect
              </h2>
              <p className="text-slate-600 mb-6 flex-1">
                Upload your one-pager and pitch your seed-stage business to an AI investor. You'll get an honest written breakdown of your pitch and idea afterwards.
              </p>
              <div className="text-xs text-slate-400 mb-4">
                Around 15 minutes. For founders raising seed.
              </div>
              <div className="inline-flex items-center text-purple-600 font-semibold group-hover:gap-3 gap-2 transition-all">
                Start pitch conversation
                <span>→</span>
              </div>
            </div>
          </Link>

        </div>

        <div className="text-center mt-16">
          <p className="text-xs text-slate-400">
            Both work best in Chrome or Edge on desktop or Android.
          </p>
        </div>
      </div>
    </main>
  );
}
