"use client";

import { useState, useRef } from "react";
import { DIRECT_PDF_BYTES, MAX_PITCH_BYTES, MAX_PITCH_MB, MAX_PITCH_PAGES, MAX_PITCH_CHARS, MIN_PITCH_TEXT, PITCH_PAGE_LIMIT, PITCH_TEXT_LIMIT, PITCH_FILE_LIMIT } from "@/lib/pitch-document";
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
  const [uploadMessage, setUploadMessage] = useState("Reading your pitch document");
  const [error, setError] = useState("");
  const [pasteText, setPasteText] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function handleFile(file: File) {
    setError("");
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      setError("Choose a PDF, or paste the text from your document instead."); return;
    }
    if (file.size > MAX_PITCH_BYTES) { setError(PITCH_FILE_LIMIT); return; }
    setUploading(true); setUploadMessage("Reading your pitch document");
    try {
      let res: Response;
      if (file.size <= DIRECT_PDF_BYTES) {
        const formData = new FormData(); formData.append("file", file);
        res = await fetch("/api/extract-pitch", { method: "POST", body: formData });
      } else {
        let pages: string[];
        try {
          const { readLargePitchFile } = await import("@/lib/pitch-file-client");
          pages = await readLargePitchFile(file, (n, total) => {
            if (n === 1 || n === total || n % 10 === 0) setUploadMessage("Reading page " + n + " of " + total);
          });
        } catch (e) {
          const detail = e instanceof Error ? e : null;
          setError(detail && [PITCH_PAGE_LIMIT, PITCH_TEXT_LIMIT].includes(detail.message) ? detail.message
            : detail?.name === "PasswordException" ? "This PDF is locked. Export an unlocked copy, or paste the text."
            : "We couldn’t open this PDF. Export a searchable or smaller PDF, or paste the text.");
          setUploading(false); return;
        }
        setUploadMessage("Preparing your pitch brief");
        res = await fetch("/api/extract-pitch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pages }) });
      }
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
    if (pasteText.trim().length < MIN_PITCH_TEXT) {
      setError("Paste at least 200 characters about your business.");
      return;
    }
    if (pasteText.length > MAX_PITCH_CHARS) { setError(PITCH_TEXT_LIMIT); return; }
    setError(""); setUploadMessage("Preparing your pitch brief");
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
      <div role="status" className="glass-card rounded-3xl px-5 py-16 text-center max-w-2xl mx-auto">
        <div className="inline-block w-14 h-14 border-4 border-purple-200 border-t-purple-600 rounded-full motion-safe:animate-spin mb-6"></div>
        <p className="text-lg text-slate-800 font-semibold mb-2">{uploadMessage}</p>
        <p className="text-sm text-slate-500">We’ll show you the brief to check before the investor starts. Longer plans may take a little more time.</p>
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
        <>
          <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={e => {
            const file = e.target.files?.[0]; e.target.value = ""; if (file) handleFile(file);
          }} />
          <button type="button" onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
            onDrop={handleDrop} onClick={() => fileInputRef.current?.click()}
            className={"w-full border-2 border-dashed rounded-3xl px-5 py-12 sm:p-16 text-center smooth-transition " +
              (dragging ? "border-purple-500 glass-card-strong" : "border-slate-300 glass-card hover:border-purple-400")}>
          <span className="block mb-4">
            <svg className="w-16 h-16 mx-auto text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </span>
          <span className="block text-xl font-bold text-slate-900">Drop your pitch document here</span>
          <span className="block text-sm text-purple-700 mt-1">or choose a PDF</span>
          <span className="block text-sm text-slate-600 mt-4">One-pager, pitch deck or full business plan.</span>
          <span className="block text-xs text-slate-600 mt-1">{`Searchable PDF · up to ${MAX_PITCH_PAGES} pages · ${MAX_PITCH_MB} MB`}</span>
          </button>
          <p className="mt-3 text-center text-xs leading-relaxed text-slate-600">Up to 240,000 characters of text. Figures shown only in images or charts can be added when you check the brief.</p>
        </>
      ) : (
        <div className="glass-card rounded-3xl p-6">
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Paste your pitch, deck notes or business plan. Include the problem, customers, traction, financials and what you’re raising."
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
        <div role="alert" className="mt-4 p-4 bg-red-50/80 backdrop-blur border border-red-200 rounded-xl text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
