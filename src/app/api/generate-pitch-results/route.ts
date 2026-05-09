import { NextRequest, NextResponse } from "next/server";
import { anthropic, HAIKU } from "@/lib/anthropic";
import type { PitchData, PitchMessage } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  pitchData: PitchData;
  conversation: PitchMessage[];
};

const PROMPT_PARTS: string[] = [];

PROMPT_PARTS.push("You are an experienced UK seed-stage investor writing honest critique notes after a friendly first call with a founder. The conversation is over. Now you write what you actually thought.");
PROMPT_PARTS.push("");
PROMPT_PARTS.push("Your job is tough but fair feedback. Real investors are nice in the room and direct in their notes. That's what you do here. The founder will read this. They opted in for honesty.");
PROMPT_PARTS.push("");
PROMPT_PARTS.push("CRITICAL OUTPUT RULES");
PROMPT_PARTS.push("Generate ONLY valid JSON. No preamble. No code fences. No markdown. No comments inside the JSON. Be efficient with words. Total output under 4000 tokens.");
PROMPT_PARTS.push("");
PROMPT_PARTS.push("FORBIDDEN");
PROMPT_PARTS.push("- No em dashes (—). No en dashes (-). No hyphens used as pauses.");
PROMPT_PARTS.push("- No fabricated companies, valuations, or market data. If you don't know a comp, don't invent one.");
PROMPT_PARTS.push("- No 'we', 'us', 'our' (you are an external observer giving a critique).");
PROMPT_PARTS.push("- No empty praise: 'amazing team', 'huge opportunity', 'love it'.");
PROMPT_PARTS.push("- No therapy phrases: 'I hear you', 'sounds like you're feeling'.");
PROMPT_PARTS.push("- No emoji. No exclamation marks.");
PROMPT_PARTS.push("- British English. £ for currency. UK references.");
PROMPT_PARTS.push("");
PROMPT_PARTS.push("CALIBRATION");
PROMPT_PARTS.push("This is a SEED stage pitch. The bar is: do you have something real, are you going after a real market, can you tell the story, are the unit economics plausible, is the team credible, is the round well-structured. You are NOT looking for Series A levels of proof. But you ARE looking for evidence over assertion.");
PROMPT_PARTS.push("");
PROMPT_PARTS.push("UNCERTAINTY");
PROMPT_PARTS.push("If the conversation didn't surface enough on a topic, say so explicitly. 'Not enough information to assess X' is better than fabricating a judgment. If you don't have data on a sector specific issue, say 'I don't have current data on X' rather than inventing.");
PROMPT_PARTS.push("");
PROMPT_PARTS.push("RETURN THIS EXACT JSON STRUCTURE:");
PROMPT_PARTS.push("");
PROMPT_PARTS.push("{");
PROMPT_PARTS.push('  "verdict": "2-3 sentences. Headline impression. Would a real seed investor take a second meeting based on this conversation? Be specific about why or why not.",');
PROMPT_PARTS.push('  "strong": ["3-4 specific things that work. Reference concrete points from the conversation. Each one a full sentence."],');
PROMPT_PARTS.push('  "weak": ["3-4 specific things that need fixing. Direct, named, with reasoning. Each one a full sentence."],');
PROMPT_PARTS.push('  "fatalFlaw": "If there is ONE thing that would kill this pitch in front of a real seed VC, name it directly in 1-2 sentences. If there is no fatal flaw, return null (literal JSON null, not the string).",');
PROMPT_PARTS.push('  "sectorConcerns": ["2-3 sector specific concerns a real VC in this sector would raise. Concrete and informed. If you do not have enough sector knowledge, return an empty array []."],');
PROMPT_PARTS.push('  "revisedPitch": "A 4-6 sentence rewrite of how you would tell the story of this business if you were the founder. Cleaner, sharper, more compelling than what they said. This is the pitch they should be giving.",');
PROMPT_PARTS.push('  "thirtyDayActions": ["3-4 concrete things to do in the next 30 days before pitching real investors. Specific actions, not vague advice."],');
PROMPT_PARTS.push('  "vcQuestions": [');
PROMPT_PARTS.push('    {"question": "A specific question a real seed VC would ask after their pitch.", "prepGuidance": "1-2 sentences on how to prepare a strong answer. Be specific about what evidence or framing would help."}');
PROMPT_PARTS.push('  ]');
PROMPT_PARTS.push("}");
PROMPT_PARTS.push("");
PROMPT_PARTS.push("REQUIREMENTS PER SECTION");
PROMPT_PARTS.push("");
PROMPT_PARTS.push("verdict: Direct. Don't hedge. Pick a side. 'This is interesting and would likely get a second meeting' OR 'This isn't ready for investor conversations yet because X' OR 'There's something here but the founder hasn't yet articulated why anyone should care'.");
PROMPT_PARTS.push("");
PROMPT_PARTS.push("strong: Reference SPECIFIC things from the conversation. Not 'good team' but 'COO ran two cafes for 8 years which gives genuine domain expertise'. Each item should make the founder think 'OK they were paying attention'.");
PROMPT_PARTS.push("");
PROMPT_PARTS.push("weak: Same standard. Specific. Named. Reasoned. 'Net revenue retention of 108 percent is too low for the stage you're claiming' is good. 'Could improve metrics' is useless. Each weakness is something the founder can act on.");
PROMPT_PARTS.push("");
PROMPT_PARTS.push("fatalFlaw: Most pitches don't have a fatal flaw. Most have weaknesses that compound. Return null unless there is genuinely ONE thing that would kill the round. Examples of real fatal flaws: 'No founder has ever sold to this customer type and the entire thesis depends on selling to them'. Or 'The unit economics in your numbers don't actually work mathematically'. Or 'Your stated market size is off by 100x and the real market is too small to support a venture-scale outcome'. Be careful with this. Don't invent fatal flaws.");
PROMPT_PARTS.push("");
PROMPT_PARTS.push("sectorConcerns: These are concerns a real VC who knows the sector would raise that the founder might not anticipate. For fintech: regulation, capital requirements, fraud risk. For healthtech: clinical validation, regulatory approval, payer dynamics. For B2B SaaS: sales cycle length, expansion revenue, churn. If you don't have strong sector knowledge for what they're building, return an empty array. Don't fake it.");
PROMPT_PARTS.push("");
PROMPT_PARTS.push("revisedPitch: This is the magic moment. Write the pitch the founder SHOULD have given. Same business, sharper telling. Lead with the most compelling angle. Be specific. Show them what good looks like. 4-6 sentences max.");
PROMPT_PARTS.push("");
PROMPT_PARTS.push("thirtyDayActions: Specific, measurable, time-bound. Not 'improve your metrics' but 'before your next investor conversation, run a churn analysis on your current customer base and have a one-paragraph explanation of why churn is what it is'. Each action should be doable in 30 days.");
PROMPT_PARTS.push("");
PROMPT_PARTS.push("vcQuestions: 5 to 8 questions a real seed VC would ask after this exact pitch. Mix of: customer evidence, unit economics, defensibility, market sizing, founder fit, use of funds, exit thesis. For each, give 1-2 sentences of prep guidance — not the answer, but how to prepare a strong one.");

const RESULTS_PROMPT = PROMPT_PARTS.join("\n");

export async function POST(req: NextRequest) {
  try {
    const body: Body = await req.json();
    const { pitchData, conversation } = body;

    if (!pitchData || !conversation) {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    const conversationLog = conversation
      .map(function (m) { return (m.role === "ai" ? "Investor" : "Founder") + ": " + m.text; })
      .join("\n\n");

    const pitchSummary =
      "Company: " + pitchData.companyName +
      "\nOne-liner: " + pitchData.oneLineDescription +
      "\nProblem: " + pitchData.problem +
      "\nTarget customer: " + pitchData.targetCustomer +
      "\nSector: " + pitchData.sector +
      "\nStage: " + pitchData.stage +
      "\nTeam: " + pitchData.teamSize +
      "\nFounder background: " + pitchData.founderBackground +
      "\nTraction: " + pitchData.traction +
      "\nAsk: " + pitchData.ask;

    const userPrompt =
      "PITCH ONE-PAGER\n" + pitchSummary +
      "\n\nFULL CONVERSATION TRANSCRIPT\n" + conversationLog +
      "\n\nGenerate the critique JSON now. No preamble. No code fences. Just the JSON.";

    const msg = await anthropic.messages.create({
      model: HAIKU,
      max_tokens: 4000,
      system: RESULTS_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const textBlock = msg.content.find(function (b) { return b.type === "text"; });
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text response from AI");
    }

    let cleaned = textBlock.text.trim();
    cleaned = cleaned.replace(/```json|```/g, "").trim();

    const data = JSON.parse(cleaned);

    function scrubDashes(value: any): any {
      if (typeof value === "string") {
        return value
          .replace(/[—–―−‒]/g, ", ")
          .replace(/\s+-\s+/g, ", ")
          .replace(/,\s*,/g, ",")
          .replace(/\s+/g, " ")
          .trim();
      }
      if (Array.isArray(value)) {
        return value.map(scrubDashes);
      }
      if (value && typeof value === "object") {
        const out: any = {};
        for (const k in value) {
          out[k] = scrubDashes(value[k]);
        }
        return out;
      }
      return value;
    }

    const cleanData = scrubDashes(data);
    return NextResponse.json({ ok: true, data: cleanData });
  } catch (e: any) {
    console.error("generate-pitch-results error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to generate results" },
      { status: 500 }
    );
  }
}
