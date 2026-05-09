"use client";

import { useRouter } from "next/navigation";

export default function PitchPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 px-6 py-16 flex items-center justify-center">
      <div className="max-w-xl text-center">
        <div className="text-sm font-semibold text-purple-600 mb-3 tracking-widest uppercase">
          Pitch Perfect
        </div>
        <h1 className="text-4xl font-bold text-slate-900 mb-4">
          Coming together now
        </h1>
        <p className="text-slate-600 mb-2">
          Pitch Perfect is being built. The AI investor sparring partner for seed-stage founders.
        </p>
        <p className="text-sm text-slate-500 mb-10">
          Upload your one-pager, get a friendly first-call experience, then receive honest written feedback on both your pitch and your business.
        </p>
        <button
          onClick={() => router.push("/")}
          className="px-6 py-3 bg-white border-2 border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50 font-medium"
        >
          Back to home
        </button>
      </div>
    </main>
  );
}
