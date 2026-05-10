"use client";

import { useState, useEffect } from "react";
import type { PitchData } from "@/types";

const INTRO_VIDEO_URL_PITCH = "https://12gousqtbfwu0esz.public.blob.vercel-storage.com/pitchperfect.mp4";

type Props = {
  data: PitchData;
  onConfirm: (data: PitchData) => void;
  onBack: () => void;
};

type FieldProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
};

function Field(props: FieldProps) {
  const { label, value, onChange, multiline, placeholder } = props;
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-purple-400 focus:outline-none text-sm resize-none"
          rows={2}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:border-purple-400 focus:outline-none"
        />
      )}
    </div>
  );
}

export default function PitchConfirm(props: Props) {
  const { data, onConfirm, onBack } = props;
  const [edited, setEdited] = useState<PitchData>(data);

  useEffect(() => {
    if (!INTRO_VIDEO_URL_PITCH) return;
    const preload = document.createElement("link");
    preload.rel = "preload";
    preload.as = "video";
    preload.href = INTRO_VIDEO_URL_PITCH;
    document.head.appendChild(preload);
    return () => {
      if (preload.parentNode) preload.parentNode.removeChild(preload);
    };
  }, []);

  function update<K extends keyof PitchData>(key: K, value: PitchData[K]) {
    setEdited({ ...edited, [key]: value });
  }

  const canConfirm = edited.companyName.trim() && edited.oneLineDescription.trim();

  return (
    <div className="w-full max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-slate-900 mb-2">Does this look right?</h2>
      <p className="text-slate-600 mb-8">Tweak anything that's wrong. The conversation works best when these are accurate.</p>

      <div className="space-y-5 bg-white rounded-2xl p-6 border border-slate-200 mb-6">
        <Field label="Company / product name" value={edited.companyName} onChange={(v) => update("companyName", v)} />
        <Field label="One-line description" value={edited.oneLineDescription} onChange={(v) => update("oneLineDescription", v)} multiline />
        <Field label="Problem you solve" value={edited.problem} onChange={(v) => update("problem", v)} multiline />
        <Field label="Target customer" value={edited.targetCustomer} onChange={(v) => update("targetCustomer", v)} multiline />
        <Field label="Sector" value={edited.sector} onChange={(v) => update("sector", v)} />
        <Field label="Stage" value={edited.stage} onChange={(v) => update("stage", v)} placeholder="idea / pre-revenue / early revenue / revenue / scaling" />
        <Field label="Team size" value={edited.teamSize} onChange={(v) => update("teamSize", v)} />
        <Field label="Founder background" value={edited.founderBackground} onChange={(v) => update("founderBackground", v)} multiline />
        <Field label="Traction so far" value={edited.traction} onChange={(v) => update("traction", v)} multiline />
        <Field label="What you're raising" value={edited.ask} onChange={(v) => update("ask", v)} placeholder="e.g. £500k seed" />
      </div>

      <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-6">
        <p className="text-sm text-purple-900">
          <strong>About the conversation: </strong>
          I'll keep this friendly because that's how a real first call goes. After we wrap up you'll get an honest written breakdown of your pitch and your business. Real investors do the same thing, nice in the room, then write what they really think in their notes.
        </p>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 px-6 py-3 border border-slate-300 rounded-xl text-slate-700 hover:bg-slate-50"
        >
          Start over
        </button>
        <button
          onClick={() => canConfirm && onConfirm(edited)}
          disabled={!canConfirm}
          className="flex-1 px-6 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Looks right, let's talk
        </button>
      </div>
    </div>
  );
}
