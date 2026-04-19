"use client";

import { useState } from "react";
import type { CVData } from "@/types";

type Props = {
  data: CVData;
  onConfirm: (data: CVData) => void;
  onBack: () => void;
};

const MIN_LOVED = 3;
const MAX_LOVED = 5;
const MAX_AVOID = 3;

export default function CVConfirm({ data, onConfirm, onBack }: Props) {
  const [edited, setEdited] = useState<CVData>({
    ...data,
    lovedSkills: data.lovedSkills || [],
    avoidSkills: data.avoidSkills || [],
  });

  function update<K extends keyof CVData>(key: K, value: CVData[K]) {
    setEdited({ ...edited, [key]: value });
  }

  const lovedComplete = edited.lovedSkills.length >= MIN_LOVED;
  const canConfirm = lovedComplete;

  return (
    <div className="w-full max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-slate-900 mb-2">Does this look right?</h2>
      <p className="text-slate-600 mb-8">Tweak anything that's wrong, then we'll get into the conversation.</p>

      <div className="space-y-5 bg-white rounded-2xl p-6 border border-slate-200 mb-6">
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
          onChange={(items) => {
            const newLoved = edited.lovedSkills.filter((s) => items.includes(s));
            const newAvoid = edited.avoidSkills.filter((s) => items.includes(s));
            setEdited({ ...edited, keySkills: items, lovedSkills: newLoved, avoidSkills: newAvoid });
          }}
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

      <RankPicker
        title="What do you actually love doing?"
        subtitle={`Pick at least ${MIN_LOVED} (up to ${MAX_LOVED}) skills from above. Number 1 should be the one you'd happily do all day.`}
        emptyHint="Tap a skill to add it. Tap a ranked item to remove it. Use arrows to reorder."
        sourceItems={edited.keySkills}
        ranked={edited.lovedSkills}
        max={MAX_LOVED}
        accent="indigo"
        onChange={(items) => update("lovedSkills", items)}
      />

      <RankPicker
        title="Anything you'd rather not do much of?"
        subtitle={`Optional. Pick up to ${MAX_AVOID} skills you'd happily not use much in your next role. Skip if nothing here puts you off.`}
        emptyHint="Tap to add. Tap to remove. Order doesn't matter as much here."
        sourceItems={edited.keySkills}
        ranked={edited.avoidSkills}
        max={MAX_AVOID}
        accent="slate"
        onChange={(items) => update("avoidSkills", items)}
      />

      <div className="flex gap-3 mt-8">
        <button
          onClick={onBack}
          className="flex-1 px-6 py-3 border border-slate-300 rounded-xl text-slate-700 hover:bg-slate-50"
        >
          Start over
        </button>
        <button
          onClick={() => canConfirm && onConfirm(edited)}
          disabled={!canConfirm}
          className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          title={!canConfirm ? `Pick at least ${MIN_LOVED} skills you love first` : ""}
        >
          {canConfirm ? "Looks right, let's talk" : `Pick ${MIN_LOVED - edited.lovedSkills.length} more loved skill${MIN_LOVED - edited.lovedSkills.length === 1 ? "" : "s"}`}
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

function RankPicker({
  title,
  subtitle,
  emptyHint,
  sourceItems,
  ranked,
  max,
  accent,
  onChange,
}: {
  title: string;
  subtitle: string;
  emptyHint: string;
  sourceItems: string[];
  ranked: string[];
  max: number;
  accent: "indigo" | "slate";
  onChange: (items: string[]) => void;
}) {
  const accentClasses =
    accent === "indigo"
      ? {
          rankedBg: "bg-indigo-50 border-indigo-200",
          rankedItem: "bg-white border-indigo-300 text-indigo-900",
          rankNumber: "bg-indigo-600 text-white",
          available: "border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:border-indigo-400",
          availableSelected: "bg-indigo-100 border-indigo-300 text-indigo-400 cursor-not-allowed",
        }
      : {
          rankedBg: "bg-slate-100 border-slate-300",
          rankedItem: "bg-white border-slate-400 text-slate-700",
          rankNumber: "bg-slate-600 text-white",
          available: "border-slate-300 text-slate-600 hover:bg-slate-50 hover:border-slate-500",
          availableSelected: "bg-slate-200 border-slate-300 text-slate-400 cursor-not-allowed",
        };

  function toggle(skill: string) {
    if (ranked.includes(skill)) {
      onChange(ranked.filter((s) => s !== skill));
    } else if (ranked.length < max) {
      onChange([...ranked, skill]);
    }
  }

  function moveUp(idx: number) {
    if (idx === 0) return;
    const next = [...ranked];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    onChange(next);
  }

  function moveDown(idx: number) {
    if (idx === ranked.length - 1) return;
    const next = [...ranked];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    onChange(next);
  }

  function remove(idx: number) {
    onChange(ranked.filter((_, i) => i !== idx));
  }

  const available = sourceItems;

  if (sourceItems.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-6 border border-slate-200 mb-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-1">{title}</h3>
        <p className="text-sm text-slate-500 italic">Add some key skills above first.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200 mb-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-1">{title}</h3>
      <p className="text-sm text-slate-600 mb-4">{subtitle}</p>

      {ranked.length > 0 ? (
        <div className={`${accentClasses.rankedBg} rounded-xl p-4 mb-4 border-2`}>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
            Your picks ({ranked.length}/{max})
          </p>
          <div className="space-y-2">
            {ranked.map((item, idx) => (
              <div
                key={item}
                className={`flex items-center gap-3 p-3 rounded-lg border-2 ${accentClasses.rankedItem}`}
              >
                <div
                  className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${accentClasses.rankNumber}`}
                >
                  {idx + 1}
                </div>
                <div className="flex-1 font-medium">{item}</di
