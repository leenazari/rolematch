"use client";

import { useState } from "react";
import type { CVData } from "@/types";

type Props = {
  data: CVData;
  onConfirm: (data: CVData) => void;
  onBack: () => void;
};
const INTRO_VIDEO_URL = "https://12gousqtbfwu0esz.public.blob.vercel-storage.com/rolematch.mp4";
const MIN_LOVED = 3;
const MAX_LOVED = 5;
const MAX_AVOID = 3;

type FieldProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
};

type ChipsFieldProps = {
  label: string;
  subtitle?: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
};

type SkillsRankerProps = {
  skills: string[];
  onSkillsChange: (skills: string[]) => void;
  loved: string[];
  onLovedChange: (loved: string[]) => void;
};

type AvoidPickerProps = {
  sourceItems: string[];
  ranked: string[];
  onChange: (items: string[]) => void;
};

export default function CVConfirm(props: Props) {
  const { data, onConfirm, onBack } = props;
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
  const remaining = MIN_LOVED - edited.lovedSkills.length;

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

        <Field label="Education" value={edited.education} onChange={(v) => update("education", v)} />

        <ChipsField
          label="Notable employers"
          subtitle="Tap to remove. Add any we missed."
          items={edited.notableEmployers}
          onChange={(items) => update("notableEmployers", items)}
          placeholder="Add an employer"
        />
      </div>

      <SkillsRanker
        skills={edited.keySkills}
        onSkillsChange={(items) => {
          const newLoved = edited.lovedSkills.filter((s) => items.includes(s));
          const newAvoid = edited.avoidSkills.filter((s) => items.includes(s));
          setEdited({ ...edited, keySkills: items, lovedSkills: newLoved, avoidSkills: newAvoid });
        }}
        loved={edited.lovedSkills}
        onLovedChange={(loved) => update("lovedSkills", loved)}
      />

      <AvoidPicker
        sourceItems={edited.keySkills}
        ranked={edited.avoidSkills}
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
        >
          {canConfirm ? "Looks right, let's talk" : `Pick ${remaining} more loved skill${remaining === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  );
}

function Field(props: FieldProps) {
  const { label, value, onChange } = props;
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

function ChipsField(props: ChipsFieldProps) {
  const { label, subtitle, items, onChange, placeholder } = props;
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

function SkillsRanker(props: SkillsRankerProps) {
  const { skills, onSkillsChange, loved, onLovedChange } = props;
  const [draft, setDraft] = useState("");

  function addSkill() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (skills.some((it) => it.toLowerCase() === trimmed.toLowerCase())) {
      setDraft("");
      return;
    }
    onSkillsChange([...skills, trimmed]);
    setDraft("");
  }

  function removeSkill(skill: string) {
    onSkillsChange(skills.filter((s) => s !== skill));
    if (loved.includes(skill)) {
      onLovedChange(loved.filter((s) => s !== skill));
    }
  }

  function toggleLoved(skill: string) {
    if (loved.includes(skill)) {
      onLovedChange(loved.filter((s) => s !== skill));
    } else if (loved.length < MAX_LOVED) {
      onLovedChange([...loved, skill]);
    }
  }

  function moveUp(idx: number) {
    if (idx === 0) return;
    const next = [...loved];
    const tmp = next[idx - 1];
    next[idx - 1] = next[idx];
    next[idx] = tmp;
    onLovedChange(next);
  }

  function moveDown(idx: number) {
    if (idx === loved.length - 1) return;
    const next = [...loved];
    const tmp = next[idx + 1];
    next[idx + 1] = next[idx];
    next[idx] = tmp;
    onLovedChange(next);
  }

  function removeFromLoved(idx: number) {
    onLovedChange(loved.filter((_, i) => i !== idx));
  }

  const lovedFull = loved.length >= MAX_LOVED;

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200 mb-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-1">Your skills</h3>
      <p className="text-sm text-slate-600 mb-1">
        Tap the heart on a skill to mark it as one you love. Pick at least {MIN_LOVED} (up to {MAX_LOVED}).
      </p>
      <p className="text-xs text-slate-500 mb-4">
        Number 1 in your loved list should be the one you'd happily do all day. Use arrows to reorder.
      </p>

      {loved.length > 0 && (
        <div className="bg-indigo-50 border-2 border-indigo-200 rounded-xl p-4 mb-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-700 mb-3">
            Loved, ranked ({loved.length}/{MAX_LOVED})
          </p>
          <div className="space-y-2">
            {loved.map((item, idx) => (
              <div
                key={item}
                className="flex items-center gap-3 p-3 rounded-lg border-2 bg-white border-indigo-300 text-indigo-900"
              >
                <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold bg-indigo-600 text-white">
                  {idx + 1}
                </div>
                <div className="flex-1 font-medium">{item}</div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => moveUp(idx)}
                    disabled={idx === 0}
                    className="w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Move up"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => moveDown(idx)}
                    disabled={idx === loved.length - 1}
                    className="w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Move down"
                  >
                    ▼
                  </button>
                  <button
                    onClick={() => removeFromLoved(idx)}
                    className="w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50"
                    aria-label="Remove from loved"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
        {skills.length === 0 ? (
          <p className="text-sm text-slate-400 italic mb-3">No skills yet. Add some below.</p>
        ) : (
          <div className="flex flex-wrap gap-2 mb-3">
            {skills.map((skill) => {
              const isLoved = loved.includes(skill);
              const lovedRank = isLoved ? loved.indexOf(skill) + 1 : null;
              const canLove = !isLoved && !lovedFull;
              return (
                <div
                  key={skill}
                  className={`inline-flex items-center gap-1 rounded-full text-sm font-medium border transition-colors ${
                    isLoved
                      ? "bg-indigo-100 border-indigo-400 text-indigo-900"
                      : "bg-white border-slate-300 text-slate-700"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleLoved(skill)}
                    disabled={!isLoved && lovedFull}
                    className={`flex items-center gap-1.5 pl-3 pr-1 py-1.5 rounded-l-full ${
                      isLoved
                        ? "hover:bg-indigo-200"
                        : canLove
                        ? "hover:bg-indigo-50 hover:text-indigo-700"
                        : "cursor-not-allowed opacity-60"
                    }`}
                    title={
                      isLoved
                        ? `Loved (rank ${lovedRank}). Tap to unlove.`
                        : canLove
                        ? "Tap the heart to mark as loved"
                        : `Maximum ${MAX_LOVED} loved skills reached`
                    }
                  >
                    <span className={isLoved ? "text-pink-500" : "text-slate-300"}>
                      {isLoved ? "♥" : "♡"}
                    </span>
                    <span>{skill}</span>
                    {isLoved && (
                      <span className="ml-1 px-1.5 text-xs font-bold bg-indigo-600 text-white rounded-full">
                        {lovedRank}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSkill(skill)}
                    className="px-2 py-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-r-full"
                    title="Remove this skill entirely"
                    aria-label="Remove skill"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
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
                addSkill();
              }
            }}
            placeholder="Add a skill"
            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:border-indigo-400 focus:outline-none text-sm bg-white"
          />
          <button
            type="button"
            onClick={addSkill}
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

function AvoidPicker(props: AvoidPickerProps) {
  const { sourceItems, ranked, onChange } = props;

  function toggle(skill: string) {
    if (ranked.includes(skill)) {
      onChange(ranked.filter((s) => s !== skill));
    } else if (ranked.length < MAX_AVOID) {
      onChange([...ranked, skill]);
    }
  }

  if (sourceItems.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200 mb-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-1">
        Anything you'd rather not do much of?
      </h3>
      <p className="text-sm text-slate-600 mb-4">
        Optional. Pick up to {MAX_AVOID} skills you'd happily not use much in your next role. Skip if nothing here puts you off.
      </p>

      <div className="flex flex-wrap gap-2">
        {sourceItems.map((skill) => {
          const isSelected = ranked.includes(skill);
          const isFull = ranked.length >= MAX_AVOID && !isSelected;
          const cls = isSelected
            ? "bg-slate-200 border-slate-500 text-slate-800"
            : isFull
            ? "border-slate-200 text-slate-300 cursor-not-allowed"
            : "border-slate-300 text-slate-600 hover:bg-slate-50 hover:border-slate-500";
          return (
            <button
              key={skill}
              onClick={() => toggle(skill)}
              disabled={isFull}
              className={`px-3 py-1.5 border rounded-full text-sm font-medium transition-colors ${cls}`}
            >
              {skill}
              {isSelected && <span className="ml-1 text-xs">✓</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
