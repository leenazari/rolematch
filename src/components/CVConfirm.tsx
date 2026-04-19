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

        <ChipsField
          label="Key skills"
          subtitle="Tap a chip to remove. Add anything that's missing."
          items={edited.keySkills}
          onChange={(items) => update("keySkills", items)}
          placeholder="Add a skill"
        />

        <Field label="Education" value={edited.education} onChange={(v) => update("education", v)} />

        <ChipsField
          label="Notable employers"
          subtitle="Tap to remove. Add any we missed."
          items={edited.notableEmployers}
          onChange={(items) => update("notableEmployers", items)}
          placeholder="Add an employer"
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

function ChipsField({
  label,
  subtitle,
  items,
  onChange,
  placeholder,
}: {
  label: string;
  subtitle?: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");

  function addItem() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (items.some((it) => it.toLowerCase() === trimmed.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...items, trimmed]);
    setDraft("");
  }

  function removeAt(idx: number) {
    onChange(items.filter((_, i) => i !== idx));
  }

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {subtitle && <p className="text-xs text-slate-500 mb-3">{subtitle}</p>}

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
        {items.length === 0 ? (
          <p className="text-sm text-slate-400 italic mb-3">Nothing here yet. Add some below.</p>
        ) : (
          <div className="flex flex-wrap gap-2 mb-3">
            {items.map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => removeAt(idx)}
                className="group inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-indigo-200 text-indigo-700 rounded-full text-sm font-medium hover:border-red-300 hover:bg-red-50 hover:text-red-600 transition-colors"
                title="Tap to remove"
              >
                <span>{item}</span>
                <span className="text-indigo-300 group-hover:text-red-400 text-xs">✕</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addItem();
              }
            }}
            placeholder={placeholder}
            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:border-indigo-400 focus:outline-none text-sm bg-white"
          />
          <button
            type="button"
            onClick={addItem}
            disabled={!draft.trim()}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
