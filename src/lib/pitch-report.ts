import OpenAI from "openai";
import type { PitchCritique } from "@/types";

const stringArray = { type: "array", items: { type: "string" } };
const properties = {
  verdict: { type: "string" },
  verdictCategory: { type: "string", enum: ["ready", "almost", "keep_building"] },
  strong: stringArray,
  weak: stringArray,
  fatalFlaw: { type: ["string", "null"] },
  sectorConcerns: stringArray,
  revisedPitch: { type: "string" },
  thirtyDayActions: stringArray,
  vcQuestions: {
    type: "array",
    items: {
      type: "object",
      properties: { question: { type: "string" }, prepGuidance: { type: "string" } },
      required: ["question", "prepGuidance"],
      additionalProperties: false,
    },
  },
  glossary: {
    type: "array",
    items: {
      type: "object",
      properties: { term: { type: "string" }, definition: { type: "string" } },
      required: ["term", "definition"],
      additionalProperties: false,
    },
  },
};

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string");
}

function isStringPairArray(value: unknown, first: string, second: string): boolean {
  return Array.isArray(value) && value.every(item =>
    item && typeof item === "object" &&
    typeof item[first] === "string" && typeof item[second] === "string"
  );
}

export function isPitchCritique(value: unknown): value is PitchCritique {
  if (!value || typeof value !== "object") return false;
  const report = value as Record<string, unknown>;
  return typeof report.verdict === "string" &&
    typeof report.revisedPitch === "string" &&
    ["ready", "almost", "keep_building"].includes(report.verdictCategory as string) &&
    (report.fatalFlaw === null || typeof report.fatalFlaw === "string") &&
    isStringArray(report.strong) && isStringArray(report.weak) &&
    isStringArray(report.sectorConcerns) && isStringArray(report.thirtyDayActions) &&
    isStringPairArray(report.vcQuestions, "question", "prepGuidance") &&
    isStringPairArray(report.glossary, "term", "definition");
}

function client(timeout: number) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Pitch reports are not configured. Please contact support.");
  }
  return new OpenAI({ timeout, maxRetries: 0 });
}

function parameters(instructions: string, input: string, model = process.env.OPENAI_PITCH_REPORT_MODEL || "gpt-6.1-sol") {
  return {
    model,
    instructions,
    input,
    reasoning: { effort: "low" as const },
    max_output_tokens: 8000,
    store: false,
    text: {
      format: {
        type: "json_schema" as const,
        name: "pitch_critique",
        strict: true,
        schema: {
          type: "object",
          properties,
          required: Object.keys(properties),
          additionalProperties: false,
        },
      },
    },
  };
}

export async function beginPitchReport(instructions: string, input: string, model?: string) {
  return client(25_000).responses.create({ ...parameters(instructions, input, model), background: true, store: true });
}

export async function retrievePitchReport(responseId: string) {
  return client(20_000).responses.retrieve(responseId);
}

export function parsePitchReport(response: { status?: string; output_text?: string }): PitchCritique {
  if (response.status !== "completed" || !response.output_text) {
    throw new Error("The report could not be completed. Please try generating it again.");
  }
  const report: unknown = JSON.parse(response.output_text);
  if (!isPitchCritique(report)) {
    throw new Error("The report format was invalid. Please try generating it again.");
  }
  function scrub(value: any): any {
    if (typeof value === "string") return value.replace(/[—–―−‒]/g, ", ").replace(/\s+-\s+/g, ", ")
      .replace(/,\s*,/g, ",").replace(/\s+/g, " ").trim();
    if (Array.isArray(value)) return value.map(scrub);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrub(v)]));
    return value;
  }
  return scrub(report);
}

export async function generatePitchReport(instructions: string, input: string): Promise<PitchCritique> {
  return parsePitchReport(await client(45_000).responses.create(parameters(instructions, input)));
}
