import { isPitchCritique, scrubPitchReport, PITCH_OPENING_KEYS, PITCH_DETAIL_KEYS } from "@/lib/pitch-report";
import type { PitchCritique } from "@/types";

// Only complete JSON values become visible. An unfinished paragraph or array stays hidden.
function valueEnd(text: string, start: number): number {
  const opener = text[start];
  let quoted = false, escaped = false;
  const stack: string[] = [];
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') { quoted = false; if (opener === '"' && stack.length === 0) return i + 1; }
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === "{" || c === "[") stack.push(c === "{" ? "}" : "]");
    else if (c === "}" || c === "]") {
      if (!stack.length) return i;
      if (stack.pop() !== c) return -1;
      if (!stack.length) return i + 1;
    } else if (c === "," && !stack.length) return i;
  }
  return -1;
}

const defaults: PitchCritique = { verdict: "", verdictCategory: "keep_building", strong: [], weak: [],
  fatalFlaw: null, sectorConcerns: [], revisedPitch: "", thirtyDayActions: [], vcQuestions: [], glossary: [] };
const previewKeys = new Set([...Object.keys(defaults), "aiOpportunities"]);

export function parsePartialPitchReport(text: string): Partial<PitchCritique> {
  const partial: Record<string, unknown> = {};
  let position = text.search(/\S/);
  if (text[position] !== "{") return partial;
  position++;
  while (position < text.length) {
    while (/\s/.test(text[position] || "") || text[position] === ",") position++;
    if (text[position] !== '"') break;
    const keyEnd = valueEnd(text, position);
    if (keyEnd < 0) break;
    let key: string;
    try { key = JSON.parse(text.slice(position, keyEnd)); } catch { break; }
    position = keyEnd;
    while (/\s/.test(text[position] || "")) position++;
    if (text[position++] !== ":") break;
    while (/\s/.test(text[position] || "")) position++;
    const end = valueEnd(text, position);
    if (end < 0) break;
    try {
      const value = JSON.parse(text.slice(position, end));
      if (key === "first" || key === "second") {
        const keys = key === "first" ? PITCH_OPENING_KEYS : PITCH_DETAIL_KEYS;
        if ((key === "first" || PITCH_OPENING_KEYS.every(field => Object.hasOwn(partial, field))) &&
          value && typeof value === "object" && keys.every(field => Object.hasOwn(value, field)) &&
          isPitchCritique({ ...defaults, ...value })) {
          for (const field of keys) partial[field] = value[field];
        }
      }
      // Market comparisons wait for completed-response source verification.
      if (previewKeys.has(key) && isPitchCritique({ ...defaults, [key]: value })) partial[key] = value;
    } catch { break; }
    position = end;
  }
  return scrubPitchReport(partial);
}
