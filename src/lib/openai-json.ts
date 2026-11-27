import "server-only";
import OpenAI from "openai";
import { PublicError } from "./public-error";
import type { CVData, PitchData, ResultsData } from "@/types";

type Turn = { text: string; moveOn: boolean; finished: boolean; thinAnswer: boolean };
type Results = {
  pitch_extract: Omit<PitchData, "rawText" | "sourceDocument">;
  pitch_document: Omit<PitchData, "rawText" | "sourceDocument"> & { evidence: { page: number; quote: string }[] };
  cv_extract: Omit<CVData, "rawText" | "lovedSkills" | "avoidSkills">;
  pitch_question: Turn;
  career_question: Turn & { isGoldenThreadProbe: boolean };
  career_results: ResultsData;
};

const str = { type: "string" };
const bool = { type: "boolean" };
const strings = { type: "array", items: str };
const object = (properties: Record<string, unknown>) => ({
  type: "object", properties, required: Object.keys(properties), additionalProperties: false,
});
const choice = (...values: string[]) => ({ type: "string", enum: values });
const turn = { text: str, moveOn: bool, finished: bool, thinAnswer: bool };
const role = {
  title: str, matchScore: { type: "integer", minimum: 0, maximum: 100 }, consultantParagraph: str,
  yourStrengths: strings, developmentGaps: strings, nextStep: str,
  salary: object({ entry: str, established: str, senior: str, startingTier: choice("entry", "established", "senior") }),
};
const pitchFields = {
  companyName: str, oneLineDescription: str, problem: str, targetCustomer: str, sector: str,
  stage: choice("idea", "pre-revenue", "early revenue", "revenue", "scaling"),
  teamSize: str, founderBackground: str, traction: str, ask: str,
};
const tasks = {
  pitch_extract: { tokens: 2048, schema: object(pitchFields) },
  pitch_document: { tokens: 4000, schema: object({ ...pitchFields, evidence: { type: "array", maxItems: 12,
    items: object({ page: { type: "integer", minimum: 1, maximum: 100 }, quote: str }) } }) },
  cv_extract: { tokens: 2048, schema: object({
    name: str, currentRole: str, sector: str, yearsExperience: { type: "number" },
    keySkills: strings, education: str, notableEmployers: strings,
  }) },
  pitch_question: { tokens: 4096, schema: object(turn) },
  career_question: { tokens: 4096, schema: object({ ...turn, isGoldenThreadProbe: bool }) },
  career_results: { tokens: 5000, schema: object({ summary: str,
    roles: { type: "array", minItems: 5, maxItems: 5, items: { anyOf: [
      object({ category: choice("recommended"), ...role }),
      object({ whyUnexpected: str, category: choice("consider"), ...role }),
    ] } },
  }) },
} satisfies Record<keyof Results, { tokens: number; schema: Record<string, unknown> }>;

/** Interactive requests never start a background job or retry a paid call. */
export async function generateJson<K extends keyof Results>(task: K, instructions: string, input: string): Promise<Results[K]> {
  if (input.length > (task === "pitch_document" ? 245_000 : 120_000)) throw new PublicError("This input is too long. Please shorten it and try again.", 413);
  if (!process.env.OPENAI_API_KEY) throw new Error("The AI service is not configured.");
  const interview = task === "pitch_question" || task === "career_question";
  const model = interview
    ? process.env.OPENAI_INTERVIEW_MODEL || "gpt-6.2-astra"
    : process.env.OPENAI_TEXT_MODEL || "gpt-6.2-sol";
  const client = new OpenAI({ timeout: task === "pitch_document" ? 110_000 : interview || task === "career_results" ? 52_000 : 24_000, maxRetries: 0 });
  const { tokens, schema } = tasks[task];
  try {
    const result = await client.responses.create({
      model,
      ...(task === "pitch_question" ? { input: [{ role: "developer" as const, content: instructions }, { role: "user" as const, content: input }] } : { instructions, input }),
      store: false, reasoning: { effort: interview ? "medium" : "low" },
      max_output_tokens: tokens, text: { format: { type: "json_schema", name: task, schema, strict: true } },
    });
    if (result.status !== "completed" || !result.output_text?.trim()) throw new Error("Incomplete response");
    const parsed = JSON.parse(result.output_text) as Results[K];
    if (task === "pitch_question") console.info("Pitch investor turn", { model: result.model, input: result.usage?.input_tokens, cached: result.usage?.input_tokens_details?.cached_tokens, output: result.usage?.output_tokens });
    return parsed;
  } catch (cause) {
    // Never forward a provider response, submitted CV/pitch, or credential to the browser or logs.
    const failure = cause as { status?: number };
    console.error("OpenAI text request failed", { task, status: failure?.status });
    throw new Error("The AI could not complete this request. Please try again.");
  }
}
