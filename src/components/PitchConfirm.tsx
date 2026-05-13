"use client";

import { useState, useEffect } from "react";
import { track } from "@vercel/analytics";
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
      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
        {label}
      </label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:border-purple-400 focus:outline-none text-sm resize-none bg-white/80 smooth-transition"
          rows={2}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:border-purple-400 focus:outline-none bg-white/80 smooth-transition"
        />
      )}
    </div>
  );
}

type SectionProps = {
  title: string;
  children: React.ReactNode;
};

function Section(props: SectionProps) {
  const { title, children } = props;
  return (
    <div className="glass-card rounded-2xl p-6 mb-5">
      <div className="text-sm font-bold text-purple-600 uppercase tracking-wider mb-5">
        {title}
      </div>
      <div className="space-y-5">
        {children}
      </div>
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

  function handleConfirm() {
    track("pitch_started", { sector: edited.sector || "unknown", stage: edited.stage || "unknown" });
    onConfirm(edited);
  }

  const canConfirm = edited.companyName.trim() && edited.oneLineDescription.trim();

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="text-center mb-10">
        <h2 className="text-3xl md:text-4xl display-headline-tight text-slate-900 mb-3">
          Does this look right?
        </h2>
        <p className="text-slate-600">
          Tweak anything that's wrong. Accurate details make for a better conversation.
        </p>
      </div>

      <Section title="The company">
        <Field label="Company / product name" value={edited.companyName} onChange={(v) => update("companyName", v)} />
        <Field label="One-line description" value={edited.oneLineDescription} onChange={(v) => update("oneLineDescription", v)} multiline />
        <Field label="Sector" value={edited.sector} onChange={(v) => update("sector", v)} />
        <Field label="Stage" value={edited.stage} onChange={(v) => update("stage", v)} placeholder="idea / pre-revenue / early revenue / revenue / scaling" />
      </Section>

      <Section title="The problem">
        <Field label="Problem you solve" value={edited.problem} onChange={(v) => update("problem", v)} multiline />
        <Field label="Target customer" value={edited.targetCustomer} onChange={(v) => update("targetCustomer", v)} multiline />
      </Section>

      <Section title="The team">
        <Field label="Team size" value={edited.teamSize} onChange={(v) => update("teamSize", v)} />
        <Field label="Founder background" value={edited.founderBackground} onChange={(v) => update("founderBackground", v)} multiline />
      </Section>

      <Section title="Traction & ask">
        <Field label="Traction so far" value={edited.traction} onChange={(v) => update("traction", v)} multiline />
        <Field label="What you're raising" value={edited.ask} onChange={(v) => update("ask", v)} placeholder="e.g. £500k seed" />
      </Section>

      <div
        className="rounded-2xl p-5 mb-8"
        style={{
          background: "linear-gradient(135deg, rgba(168, 85, 247, 0.10), rgba(99, 102, 241, 0.06))",
          border: "1px solid rgba(168, 85, 247, 0.2)",
        }}
      >
        <p className="text-sm text-slate-700">
          <strong className="text-purple-700">About the conversation. </strong>
          I'll keep this friendly because that's how a real first call goes. The honest written breakdown comes after. Real investors do the same thing, nice in the room, then write what they really think in their notes.
        </p>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 px-6 py-4 glass-card rounded-2xl text-slate-700 font-semibold hover:bg-white smooth-transition"
        >
          Start over
        </button>
        <button
          onClick={() => canConfirm && handleConfirm()}
          disabled={!canConfirm}
          className="flex-[2] px-6 py-4 bg-purple-600 text-white rounded-2xl hover:bg-purple-700 font-semibold text-base disabled:opacity-40 disabled:cursor-not-allowed smooth-transition shadow-lg shadow-purple-200"
        >
          Looks right, let's talk →
        </button>
      </div>
    </div>
  );
}
