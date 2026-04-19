"use client";

import { useState } from "react";
import type { CVData } from "@/types";

type Props = {
  data: CVData;
  onConfirm: (data: CVData) => void;
  onBack: () => void;
};

export default function CVConfirm({ data, onConfirm, onBack }: Props) {
  const [edited, setEdited] = useState<CVData>(data);

  function update<K extends keyof CVData>(key: K, value: CVData[K]) {
    setEdited({ ...edited, [key]: value });
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-slate-900 mb-2">Does this look right?</h2>
      <p className="text-slate-600 mb-8">Tweak anything that's wrong, then we'll get into the conversation.</p>

      <div className="space-y-5 bg-white rounded-2xl p-6 border border-slate-200">
        <Field label="Name" value={edited.name} onChange={(v) => update("name", v)} />
        <Field label="Current role" value={edited.currentRole} onChange={(v) => update("currentRole", v)} />
        <Field label="Sector" value={edited.sector} onChange={(v) => update("sector", v)} />
        <Field
          label="Years of experience"
          value={String(edited.yearsExperience)}
          onChange={(v) => update("yearsExperience", parseInt(v) || 0)}
        />
        <Field
          label="Key skills (comma separated)"
          value={edited.keySkills.join(", ")}
          onChange={(v) => update("keySkills", v.split(",").map(s => s.trim()).filter(Boolean))}
        />
        <Field label="Education" value={edited.education} onChange={(v) => update("education", v)} />
        <Field
          label="Notable employers (comma separated)"
          value={edited.notableEmployers.join(", ")}
          onChange={(v) => update("notableEmployers", v.split(",").map(s => s.trim()).filter(Boolean))}
        />
      </div>

      <div className="flex gap-3 mt-6">
        <button
          onClick={onBack}
          className="flex-1 px-6 py-3 border border-slate-300 rounded-xl text-slate-700 hover:bg-slate-50"
        >
          Start over
        </button>
        <button
          onClick={() => onConfirm(edited)}
          className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium"
        >
          Looks right, let's talk
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-indigo-400 focus:outline-none"
      />
    </div>
  );
}
