"use client";

import { useState, useRef } from "react";
import type { PitchData } from "@/types";

type Props = {
  onExtracted: (data: PitchData) => void;
};

type Mode = "upload" | "paste";

export default function PitchUpload(props: Props) {
  const { onExtracted } = props;
  const [mode, setMode] = useState<Mode>("upload");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [pasteText, setPasteText] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function handleFile(file: File) {
    setError("");
    setUploading(true);
    try {
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        setError("Please upload a PDF file. If you have a Word doc, copy the text and paste instead.");
        setUploading(false);
        return;
      }
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/extract-pitch", { method: "POST", body: formData });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || "Failed to extract from this document.");
        setUploading(false);
        return;
      }
      onExtracted(json.data);
    } catch (e) {
      setError("Something went wrong. Please try again or paste the text instead.");
      setUploading(false);
    }
  }

  async function handlePasteSubmit() {
    if (!pasteText.trim() || pasteText.trim().length < 100) {
      setError("Please paste more of your one-pager. Even 200 words helps.");
      return;
    }
    setError("");
    setUploading(true);
    try {
      const res = await fetch("/api/extract-pitch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pasteText }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || "Failed to extract from this text.");
        setUploading(false);
        return;
      }
      onExtracted(json.data);
    } catch (e) {
      setError("Something went wrong. Please try again.");
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  if (uploading) {
    return (
      <div className="glass-card rounded-3xl py-16 text-center max-w-2xl mx-auto">
        <div className="inline-block w-14 h-14 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin mb-6"></div>
        <p className="text-lg text-slate-800 font-semibold mb-2">Reading your pitch...</p>
        <p className="text-sm text-slate-500">This usually takes about ten seconds.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex gap-2 mb-6 justify-center">
        <button
          onClick={() => { setMode("upload"); setError(""); }}
          className={mode === "upload"
            ? "px-6 py-2.5 rounded-full bg-purple-600 text-white font-semibold text-sm smooth-transition shadow-lg shadow-purple-200"
            : "px-6 py-2.5 rounded-full glass-card text-slate-700 font-semibold text-sm hover:bg-white smooth-transition"}
        >
          Upload PDF
        </button>
        <button
          onClick={() => { setMode("paste"); setError(""); }}
          className={mode === "paste"
            ? "px-6 py-2.5 rounded-full bg-purple-600 text-white font-semibold text-sm smooth-transition shadow-lg shadow-purple-200"
            : "px-6 py-2.5 rounded-full glass-card text-slate-700 font-semibold text-sm hover:bg-white smooth-transition"}
        >
          Paste text
        </button>
      </div>

      {mode === "upload" ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={dragging
            ? "border-2 border-dashed border-purple-500 glass-card-strong rounded-3xl p-16 text-center cursor-pointer smooth-transition"
            : "border-2 border-dashed border-slate-300 glass-card rounded-3xl p-16 text-center cursor-pointer hover:border-purple-400 smooth-transition"}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          <div className="mb-4">
            <svg className="w-16 h-16 mx-auto text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-xl font-bold text-slate-900 mb-2">
            Drop your one-pager here
          </p>
          <p className="text-sm text-slate-500 mb-3">
            or click to browse
          </p>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            PDF up to 3 pages. Include problem, solution, traction, team, market, ask.
          </p>
        </div>
      ) : (
        <div className="glass-card rounded-3xl p-6">
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Paste your pitch text here. Include problem, solution, traction, team, market, and what you're raising. The more detail, the better the conversation."
            className="w-full h-64 p-4 border border-slate-300 rounded-xl focus:border-purple-400 focus:outline-none resize-none text-sm bg-white/80 smooth-transition"
          />
          <button
            onClick={handlePasteSubmit}
            disabled={!pasteText.trim()}
            className="mt-4 w-full px-6 py-4 bg-purple-600 text-white rounded-xl hover:bg-purple-700 font-semibold disabled:opacity-40 disabled:cursor-not-allowed smooth-transition shadow-lg shadow-purple-200"
          >
            Use this text
          </button>
        </div>
      )}

      {error && (
        <div className="mt-4 p-4 bg-red-50/80 backdrop-blur border border-red-200 rounded-xl text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
