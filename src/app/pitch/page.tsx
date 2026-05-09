"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PitchUpload from "@/components/PitchUpload";
import PitchConfirm from "@/components/PitchConfirm";
import type { PitchData } from "@/types";

type Stage = "welcome" | "confirm";

export default function PitchPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("welcome");
  const [pitchData, setPitchData] = useState<PitchData | null>(null);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 px-6 py-12">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <div className="text-sm font-semibold text-purple-600 mb-3 tracking-widest uppercase">
            Pitch Perfect
          </div>
          {stage === "welcome" && (
            <>
              <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4 tracking-tight leading-tight">
                Pitch your business to an AI investor.
              </h1>
              <p className="text-lg text-slate-600 mb-2 max-w-xl mx-auto">
                Upload your one-pager, have a friendly conversation about your seed-stage business, then get an honest written breakdown.
              </p>
              <p className="text-xs text-slate-400 mb-10">
                We use your pitch only for this session. No account needed.
              </p>
            </>
          )}
        </div>

        {stage === "welcome" && (
          <PitchUpload
            onExtracted={(data) => {
              setPitchData(data);
              setStage("confirm");
            }}
          />
        )}

        {stage === "confirm" && pitchData && (
          <PitchConfirm
            data={pitchData}
            onConfirm={(finalData) => {
              sessionStorage.setItem("pitchperfect_data", JSON.stringify(finalData));
              router.push("/pitch/conversation");
            }}
            onBack={() => {
              setPitchData(null);
              setStage("welcome");
            }}
          />
        )}

        <div className="text-center mt-12">
          <button
            onClick={() => router.push("/")}
            className="text-sm text-slate-400 hover:text-slate-600 underline"
          >
            Back to home
          </button>
        </div>
      </div>
    </main>
  );
}
