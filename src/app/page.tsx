"use client";

import { useState } from "react";
import CVUpload from "@/components/CVUpload";
import CVConfirm from "@/components/CVConfirm";
import type { CVData } from "@/types";

type Stage = "welcome" | "confirm";

export default function Home() {
  const [stage, setStage] = useState<Stage>("welcome");
  const [cvData, setCvData] = useState<CVData | null>(null);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 px-6 py-12">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <div className="text-sm font-semibold text-indigo-600 mb-3 tracking-widest uppercase">
            RoleMatch
          </div>
          {stage === "welcome" && (
            <>
              <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4 tracking-tight leading-tight">
                Find roles that fit, not just roles that exist.
              </h1>
              <p className="text-lg text-slate-600 mb-2 max-w-xl mx-auto">
                Your AI career coach. Upload your CV, have a quick voice chat, get personalised role suggestions.
              </p>
              <p className="text-xs text-slate-400 mb-10">
                We use your CV only for this session. No account needed.
              </p>
            </>
          )}
        </div>

        {stage === "welcome" && (
          <CVUpload
            onExtracted={(data) => {
              setCvData(data);
              setStage("confirm");
            }}
          />
        )}

        {stage === "confirm" && cvData && (
          <CVConfirm
            data={cvData}
            onConfirm={(finalData) => {
              setCvData(finalData);
              alert("Phase A complete. Voice conversation comes in Phase B.");
            }}
            onBack={() => {
              setCvData(null);
              setStage("welcome");
            }}
          />
        )}
      </div>
    </main>
  );
}
