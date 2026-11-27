"use client";
import { useState } from "react";
import { reportAccess } from "@/lib/pitch-report-client";
import { savedPitchSession } from "@/lib/pitch-session-client";
export function ReportEmail({ ready }: { ready: boolean }) {
  const [email, setEmail] = useState(() => savedPitchSession()?.state.recipientEmail || "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/email-pitch-report", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...reportAccess(), email: email.trim() }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Email delivery could not be requested. Please retry.");
      setMessage(result.status === "sent" ? "Your report has been sent. Check your inbox and spam folder."
        : "Your email request is saved. Your PDF is also available to download.");
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="rounded-2xl border border-purple-200 bg-white p-6 mb-8">
    <h2 className="font-semibold text-slate-900">Would you like your results emailed?</h2>
    <p className="text-sm text-slate-600 mt-2">Optional. Get a copy of the complete PDF shown here.</p>
    <form onSubmit={submit} className="mt-4 flex flex-col sm:flex-row gap-3">
      <label className="flex-1"><span className="sr-only">Your email address</span>
        <input type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)}
          placeholder="Your email address" className="w-full rounded-xl border border-slate-300 px-4 py-3" />
      </label>
      <button disabled={!ready || busy} className="rounded-xl bg-purple-600 px-5 py-3 font-semibold text-white disabled:opacity-50">
        {busy ? "Requesting email..." : "Email my PDF"}
      </button>
    </form>
    {!ready ? <p className="text-xs text-slate-500 mt-2">Available when your complete PDF is ready.</p> : null}
    {message ? <p role="status" className="text-sm text-slate-700 mt-3">{message}</p> : null}
  </section>;
}
