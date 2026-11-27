// A storage exception must never navigate a founder away from their answers.
const fallback = new Map<string, string>();
const keys = ["pitchperfect_data", "pitchperfect_conversation", "pitchperfect_critique", "pitchperfect_generated_at",
  "pitchperfect_report_access", "pitchperfect_insights_access", "pitchperfect_pdf_saved", "pitchperfect_started_at",
  "pitchperfect_finished_at", "pitchperfect_session"];
function stores(): Storage[] {
  const result: Storage[] = [];
  try { if (typeof sessionStorage !== "undefined") result.push(sessionStorage); } catch {}
  try { if (typeof localStorage !== "undefined") result.push(localStorage); } catch {}
  return result;
}
export const pitchStore = {
  getItem(key: string): string | null {
    if (fallback.has(key)) return fallback.get(key)!;
    for (const store of stores()) { try { const value = store.getItem(key); if (value !== null && value !== undefined) return value; } catch {} }
    return null;
  },
  setItem(key: string, value: string) {
    fallback.set(key, value);
    for (const store of stores()) { try { store.setItem(key, value); } catch {} }
  },
  removeItem(key: string) {
    fallback.delete(key);
    for (const store of stores()) { try { store.removeItem(key); } catch {} }
  },
  clear() { for (const key of keys) this.removeItem(key); },
};
