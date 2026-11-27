"use client";
import { savedPitchSession } from "@/lib/pitch-session-client";
export default function PitchError({ reset }: { error: Error; reset: () => void }) {
  const saved = savedPitchSession();
  return <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
    <section className="max-w-lg rounded-2xl bg-white p-8 border border-purple-200">
      <h1 className="text-2xl font-semibold text-slate-900">Let’s pick up your pitch</h1>
      <p className="mt-3 text-slate-600">Something interrupted the screen. Retry to reconnect to your saved answers.</p>
      <button onClick={reset} className="mt-6 rounded-xl bg-purple-600 px-5 py-3 text-white font-semibold">Retry this screen</button>
      {saved ? <a href={saved.state.finished ? "/pitch/results" : "/pitch/conversation"} className="block mt-4 text-purple-700 underline">Resume my saved pitch</a> : null}
    </section>
  </main>;
}
