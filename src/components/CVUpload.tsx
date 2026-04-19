"use client";

import { useState, useRef } from "react";
import type { CVData } from "@/types";

type Props = {
  onExtracted: (data: CVData) => void;
};

export default function CVUpload({ onExtracted }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pasteMode, setPasteMode] = useState(false);
  const [pastedText, setPastedText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError("");
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/extract-cv", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || "Could not read that CV. Try pasting the text instead.");
        setLoading(false);
        return;
      }
      onExtracted(json.data);
    } catch (e: any) {
      setError("Something went wrong. Try again or paste the text.");
      setLoading(false);
    }
  }

  async function handlePaste() {
    if (pastedText.trim().length < 100) {
      setError("Please paste your full CV text (at least a paragraph).");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/extract-cv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pastedText }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || "Could not process that text.");
        setLoading(false);
        return;
      }
      onExtracted(json.data);
    } catch (e: any) {
      setError("Something went wrong. Try again.");
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="text-center">
        <div className="inline-block w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
        <p className="text-slate-600">Reading your CV...</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto">
      {!pasteMode ? (
        <>
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file) handleFile(file);
            }}
            className="border-2 border-dashed border-slate-300 rounded-2xl p-12 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
          >
            <div className="text-5xl mb-4">📄</div>
            <p className="text-slate-700 font-medium mb-2">Drop your CV here</p>
            <p className="text-slate-500 text-sm">or click to browse (PDF)</p>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </div>
          <button
            onClick={() => setPasteMode(true)}
            className="mt-4 text-sm text-slate-500 hover:text-indigo-600 mx-auto block"
          >
            Or paste your CV as text
          </button>
        </>
      ) : (
        <>
          <textarea
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            placeholder="Paste your full CV text here..."
            className="w-full h-64 p-4 border-2 border-slate-300 rounded-2xl focus:border-indigo-400 focus:outline-none text-sm"
          />
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => { setPasteMode(false); setPastedText(""); setError(""); }}
              className="flex-1 px-4 py-3 border border-slate-300 rounded-xl text-slate-700 hover:bg-slate-50"
            >
              Back
            </button>
            <button
              onClick={handlePaste}
              className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium"
            >
              Continue
            </button>
          </div>
        </>
      )}
      {error && (
        <p className="mt-4 text-sm text-red-600 text-center">{error}</p>
      )}
    </div>
  );
}
