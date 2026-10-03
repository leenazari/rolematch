import OpenAI from "openai";
import type { PitchCritique } from "@/types";

const stringArray = { type: "array", items: { type: "string" } };
const objectSchema = (fields: Record<string, unknown>) => ({ type: "object", properties: fields,
  required: Object.keys(fields), additionalProperties: false });
export const MAX_REPORT_INPUT_CHARS = 80_000;
export const MAX_REPORT_SEARCH_CALLS = 2;
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
  aiOpportunities: { type: "array", maxItems: 3, items: objectSchema({
    businessArea: { type: "string" }, pitchEvidence: { type: "string" }, workflow: { type: "string" },
    firstStep: { type: "string" }, successMeasure: { type: "string" }, humanCheck: { type: "string" },
  }) },
  marketResearch: objectSchema({
    scope: { type: "string" }, summary: { type: "string" },
    competitors: { type: "array", maxItems: 3, items: objectSchema({
      name: { type: "string" }, offering: { type: "string" }, overlap: { type: "string" },
      differenceToTest: { type: "string" }, sourceUrls: stringArray,
    }) },
    nextSteps: { ...stringArray, maxItems: 3 }, limitations: { type: "string" },
    sources: { type: "array", maxItems: 6, items: objectSchema({ title: { type: "string" }, url: { type: "string" } }) },
  }),
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

function sourceUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    url.hash = "";
    return url.href;
  } catch { return null; }
}
function hasStrings(value: any, keys: string[]) {
  return value && typeof value === "object" && keys.every(key => typeof value[key] === "string");
}
function validExtras(report: Record<string, any>): boolean {
  if (report.aiOpportunities !== undefined && (!Array.isArray(report.aiOpportunities) || report.aiOpportunities.length > 3 ||
    !report.aiOpportunities.every((item: unknown) => hasStrings(item,
      ["businessArea", "pitchEvidence", "workflow", "firstStep", "successMeasure", "humanCheck"])))) return false;
  const market = report.marketResearch;
  if (market === undefined) return true; // Existing saved reports remain recoverable.
  if (!hasStrings(market, ["scope", "summary", "limitations"]) || !isStringArray(market.nextSteps) ||
    !Array.isArray(market.sources) || market.sources.length > 6 ||
    !market.sources.every((item: any) => hasStrings(item, ["title", "url"]) && sourceUrl(item.url)) ||
    !Array.isArray(market.competitors) || market.competitors.length > 3) return false;
  const urls = new Set(market.sources.map((item: any) => sourceUrl(item.url)));
  return market.competitors.every((item: any) => hasStrings(item, ["name", "offering", "overlap", "differenceToTest"]) &&
    isStringArray(item.sourceUrls) && item.sourceUrls.length > 0 && item.sourceUrls.every((url: string) => urls.has(sourceUrl(url))));
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
    isStringPairArray(report.glossary, "term", "definition") && validExtras(report);
}

function client(timeout: number) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Pitch reports are not configured. Please contact support.");
  }
  return new OpenAI({ timeout, maxRetries: 0 });
}

function parameters(instructions: string, input: string, model = process.env.OPENAI_PITCH_REPORT_MODEL || "gpt-6.1-sol") {
  if (input.length > MAX_REPORT_INPUT_CHARS) throw new Error("This pitch is too long to process within the report budget. Please shorten the written answers.");
  return {
    model,
    instructions,
    input,
    reasoning: { effort: "low" as const },
    max_output_tokens: 6500,
    tools: [{ type: "web_search" as const, search_context_size: "low" as const,
      user_location: { type: "approximate" as const } }],
    tool_choice: "required" as const,
    max_tool_calls: MAX_REPORT_SEARCH_CALLS,
    include: ["web_search_call.action.sources" as const],
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
  const response = await client(20_000).responses.retrieve(responseId, { include: ["web_search_call.action.sources"] });
  return { ...response, usage: pitchReportUsage(response) };
}

export function pitchReportUsage(response: { model?: string; usage?: any; output?: any[] }) {
  const searches = (response.output || []).filter(item => item.type === "web_search_call").length;
  const usage = response.usage;
  const supported = response.model === "gpt-6.1-sol";
  const cached = usage?.input_tokens_details?.cached_tokens || 0;
  const writes = usage?.input_tokens_details?.cache_write_tokens || 0;
  const uncached = Math.max(0, (usage?.input_tokens || 0) - cached - writes);
  const estimate = supported && usage ? (uncached * 2 + cached * 0.1 + writes * 2.5 + usage.output_tokens * 10) / 1_000_000 + searches * 0.01 : null;
  return { ...usage, web_search_calls: searches, estimated_report_cost_usd: estimate === null ? null : Number(estimate.toFixed(6)),
    cost_scope: "report_and_research_only", pricing_as_of: "2026-10-03" };
}

function verifyResearch(report: any, output: any[]) {
  const market = report?.marketResearch;
  if (!market || !Array.isArray(market.sources) || !Array.isArray(market.competitors)) return;
  const retrieved = new Set<string>();
  const add = (url: unknown) => { const safe = sourceUrl(url); if (safe) retrieved.add(safe); };
  for (const item of output) {
    if (item.type === "web_search_call") {
      for (const source of item.action?.sources || []) add(source.url);
      if (item.action?.type === "open_page") add(item.action.url);
    }
    if (item.type === "message") for (const content of item.content || []) {
      for (const annotation of content.annotations || []) if (annotation.type === "url_citation") add(annotation.url);
    }
  }
  market.sources = market.sources.filter((item: any) => hasStrings(item, ["title", "url"]) && retrieved.has(sourceUrl(item.url)!))
    .slice(0, 6).map((item: any) => ({ title: item.title, url: sourceUrl(item.url) }));
  const cited = new Set(market.sources.map((item: any) => item.url));
  const originalCount = market.competitors.length;
  market.competitors = market.competitors.map((item: any) => ({ ...item,
    sourceUrls: Array.isArray(item.sourceUrls) ? item.sourceUrls.map(sourceUrl).filter((url: string) => cited.has(url)) : [],
  })).filter((item: any) => item.sourceUrls.length > 0).slice(0, 3);
  market.checkedAt = new Date().toISOString();
  if (!market.sources.length) {
    market.summary = "There was not enough cited web evidence to complete this market check. No competitor claims have been verified.";
    market.nextSteps = ["Check the official websites of alternatives your customers already use before making differentiation claims."];
    market.limitations = "Live research did not return usable sources. This report does not establish the size or completeness of your market.";
  } else if (market.competitors.length < originalCount) {
    market.summary = market.competitors.length
      ? "This short scan found cited alternatives including " + market.competitors.map((item: any) => item.name).join(", ") + ". Compare their documented offerings with your customers' needs."
      : "Sources were found, but none of the proposed competitor comparisons could be supported by those references.";
    market.nextSteps = ["Compare the cited product pages with the exact customer problem in your pitch, then test the differences with customers."];
    market.limitations += " Some competitor comparisons were omitted because their sources could not be verified.";
  }
}

export function parsePitchReport(response: { status?: string; output_text?: string; output?: any[] }): PitchCritique {
  if (response.status !== "completed" || !response.output_text) {
    throw new Error("The report could not be completed. Please try generating it again.");
  }
  const report: unknown = JSON.parse(response.output_text);
  verifyResearch(report, response.output || []);
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
