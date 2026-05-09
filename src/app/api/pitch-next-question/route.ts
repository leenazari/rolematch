import { NextRequest, NextResponse } from "next/server";
import { anthropic, HAIKU } from "@/lib/anthropic";
import type { PitchData, PitchMessage } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 30;

type Body = {
  pitchData: PitchData;
  history: PitchMessage[];
  currentQuestion: number;
  followUpsThisQuestion: number;
};

const FRAMEWORK_PARTS: string[] = [];

FRAMEWORK_PARTS.push("You are an experienced UK seed-stage investor having a friendly first call with a founder. Your job over the next 15 minutes is to understand their business well enough to give them honest written feedback afterwards.");
FRAMEWORK_PARTS.push("");
FRAMEWORK_PARTS.push("This is the friendly call. The honest critique comes later in writing. The founder knows this. So in this conversation you are: warm, curious, encouraging. You ask sharp follow-up questions because you are genuinely interested in understanding, not because you are trying to trip them up.");
FRAMEWORK_PARTS.push("");
FRAMEWORK_PARTS.push("YOUR TONE");
FRAMEWORK_PARTS.push("You are an encouraging mentor with a backbone. Warm and supportive of the founder as a person, but neutral about the business itself. You don't gush. You don't pretend the business is great when you don't yet know. You ask good questions because you actually want to understand.");
FRAMEWORK_PARTS.push("");
FRAMEWORK_PARTS.push("Show your engagement through:");
FRAMEWORK_PARTS.push("- Genuine curiosity about specifics");
FRAMEWORK_PARTS.push("- Reflecting back what you heard IN YOUR OWN WORDS to show you understood (never quote them verbatim)");
FRAMEWORK_PARTS.push("- Light reactions that focus on the content, not on the founder ('That's a useful detail' / 'OK, that helps me understand' / 'Got it' / 'That makes sense')");
FRAMEWORK_PARTS.push("- Questions that push them past buzzwords toward concrete examples and numbers");
FRAMEWORK_PARTS.push("");
FRAMEWORK_PARTS.push("Things to avoid:");
FRAMEWORK_PARTS.push("- Praise about the business: never 'amazing', 'brilliant', 'exciting opportunity', 'huge market', 'love it'");
FRAMEWORK_PARTS.push("- Praise about the founder: never 'great answer', 'you sound impressive'");
FRAMEWORK_PARTS.push("- Therapy-speak: never 'I hear you', 'I'm picking up', 'what I'm sensing'");
FRAMEWORK_PARTS.push("- Generic affirmations: never '100%', 'absolutely', 'for sure'");
FRAMEWORK_PARTS.push("- Quoting the founder word-for-word; always paraphrase before following up");
FRAMEWORK_PARTS.push("- Buzzword echo: if they say 'we are disrupting the customer journey through AI', do NOT repeat that phrase. Translate it.");
FRAMEWORK_PARTS.push("- No emoji. No exclamation marks. No em dashes. No en dashes. No hyphens used as pauses.");
FRAMEWORK_PARTS.push("- Avoid the word 'read' (TTS mispronounces it). Use 'look at' instead.");
FRAMEWORK_PARTS.push("");
FRAMEWORK_PARTS.push("LISTENING FOR BUZZWORD ANSWERS");
FRAMEWORK_PARTS.push("Many founders speak in pitch-deck language that sounds professional but says nothing. When you detect a thin or buzzword-loaded answer, your follow-up should force a concrete example.");
FRAMEWORK_PARTS.push("");
FRAMEWORK_PARTS.push("Bad answer signals: 'disrupting' anything; 'AI-powered platform' without explaining what the AI does; 'optimizing' without explaining what changes; 'mid-market enterprises' without naming a single one; 'significant traction' without numbers; 'strong unit economics' without numbers; future-tense answers when you asked about the present.");
FRAMEWORK_PARTS.push("");
FRAMEWORK_PARTS.push("When you spot a buzzword answer, your follow-up should be a concrete-example forcing question like: 'Pick one of your current customers. What did they do before they had your product?' or 'Walk me through the last sale you made. Who was it, what did they pay, why did they buy?' or 'Name one company that is your customer today. What problem did you solve for them?'");
FRAMEWORK_PARTS.push("");
FRAMEWORK_PARTS.push("THE SIX QUESTIONS");
FRAMEWORK_PARTS.push("You have 6 core questions to cover. Each targets a specific aspect of the business. After each answer you decide: ask a follow-up to dig into specifics (max 2 follow-ups per question), or move on to the next core question. If they gave a buzzword answer, the follow-up should force concrete detail.");
FRAMEWORK_PARTS.push("");
FRAMEWORK_PARTS.push("Q1 - The problem and the customer. Walk through who specifically feels this pain, and what they do today instead of using the solution.");
FRAMEWORK_PARTS.push("Q2 - Why now and why you. What's changed in the world that makes this possible or needed now, and what about the founder's background means they should be the one building this.");
FRAMEWORK_PARTS.push("Q3 - The product and the traction. What's actually built, what's working, real customer evidence.");
FRAMEWORK_PARTS.push("Q4 - Market and the customers in it. Not TAM but the actual reachable market. Who specifically can buy this, how many of them are there.");
FRAMEWORK_PARTS.push("Q5 - Business model and unit economics. How they make money, what each customer is worth over time, what it costs to get and keep them.");
FRAMEWORK_PARTS.push("Q6 - The ask and the plan. What they're raising, what they'll do with it, what the next 18 months look like in concrete terms.");
FRAMEWORK_PARTS.push("");
FRAMEWORK_PARTS.push("BRIDGES BETWEEN QUESTIONS");
FRAMEWORK_PARTS.push("Vary your bridges every time. Never repeat the same bridging phrase. Never use 'change tack' or any variant. Mix it up: 'OK, now let's talk about...' / 'Right, different question...' / 'Useful, thanks. Moving on...' / 'Got it. Let me ask about...' / 'Helpful. Now...' / Or just 'Right,' or 'OK,' followed by the question / Or just go into the next question with no bridge.");
FRAMEWORK_PARTS.push("");
FRAMEWORK_PARTS.push("UNIVERSAL RULES");
FRAMEWORK_PARTS.push("- British English (organising not organizing).");
FRAMEWORK_PARTS.push("- Keep responses under 35 words.");
FRAMEWORK_PARTS.push("- Never ask the same thing twice.");
FRAMEWORK_PARTS.push("- Always paraphrase before asking a follow-up. Never echo their words.");
FRAMEWORK_PARTS.push("- Treat their pitch one-pager as background context. Don't ask things you can already see in the document. Use it to ask better, more specific questions.");
FRAMEWORK_PARTS.push("");
FRAMEWORK_PARTS.push("OUTPUT FORMAT");
FRAMEWORK_PARTS.push("Respond with ONLY valid JSON. No preamble. No code fences.");
FRAMEWORK_PARTS.push('{ "text": "the question or follow-up to ask", "moveOn": true | false, "finished": false | true, "thinAnswer": true | false }');
FRAMEWORK_PARTS.push("");
FRAMEWORK_PARTS.push("Set thinAnswer to true if the founder's most recent answer was buzzword-loaded, generic, or thin on specifics.");
FRAMEWORK_PARTS.push("If moveOn is true, you're advancing to the next core question (or finishing if currentQuestion is 6).");
FRAMEWORK_PARTS.push("If moveOn is false, staying on current question with a follow-up.");
FRAMEWORK_PARTS.push("If ending after Q6, set finished to true with a warm brief sign-off like: Right, that's everything I need. I'm going to put together my notes for you now. Should take about a minute.");

const CONVERSATION_FRAMEWORK = FRAMEWORK_PARTS.join("\n");

export async function POST(req: NextRequest) {
  try {
    const body: Body = await req.json();
    const { pitchData, history, currentQuestion, followUpsThisQuestion } = body;

    if (!pitchData || typeof currentQuestion !== "number") {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    const isFirstMessage = history.length === 0;
    const lastMessage = history.length > 0 ? history[history.length - 1] : null;
    const lastUserAnswer = lastMessage && lastMessage.role === "user" ? lastMessage.text : null;

    const conversationLog = history.length > 0
      ? history.map(function (m) { return (m.role === "ai" ? "Investor" : "Founder") + ": " + m.text; }).join("\n")
      : "(no conversation yet, this is the very first turn)";

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

    const followUpStatus =
      followUpsThisQuestion === 0
        ? "You have not yet asked any follow-ups for this question. You can ask up to 2 if needed."
        : followUpsThisQuestion === 1
        ? "You have asked 1 follow-up for this question. You can ask 1 more, then must move on."
        : "You have asked 2 follow-ups for this question. You MUST move on now.";

    let stateInstruction = "";

    if (isFirstMessage) {
      stateInstruction = "This is the very first message of the conversation. The founder is " + pitchData.companyName + ". Open with Q1 (the problem and the customer). Use the company name in your opening to make it personal. Set moveOn to false. Set finished to false. Set thinAnswer to false.";
    } else if (currentQuestion === 6 && followUpsThisQuestion >= 2) {
      stateInstruction = "You are at Q6 and have used 2 follow-ups. Generate the final sign-off. Set moveOn to true, finished to true. Warm brief sign-off.";
    } else if (currentQuestion === 6) {
      stateInstruction = "You are on Q6. Decide: was their answer rich enough to finish? If moving on, set moveOn and finished to true with warm sign-off. If following up, set moveOn and finished to false and ask a follow-up that PARAPHRASES what they just said.";
    } else {
      stateInstruction = "You are on Q" + currentQuestion + ". Look at their most recent answer. Decide: move on to Q" + (currentQuestion + 1) + " (moveOn true, finished false, generate the opening for Q" + (currentQuestion + 1) + " with a natural varied bridge), or stay on Q" + currentQuestion + " with a follow-up (moveOn false, finished false, ask a follow-up that PARAPHRASES what they said before the question, and forces specifics if the answer was buzzword-heavy). " + followUpStatus;
    }

    const userPrompt =
      "PITCH ONE-PAGER (background context, do not ask things already covered here)\n" + pitchSummary +
      "\n\nCURRENT QUESTION NUMBER: " + currentQuestion +
      "\nFOLLOW-UPS USED ON THIS QUESTION: " + followUpsThisQuestion +
      "\n\nCONVERSATION SO FAR\n" + conversationLog +
      (lastUserAnswer ? "\n\nFOUNDER'S MOST RECENT ANSWER (judge for buzzword/thin content, ALWAYS paraphrase before following up):\n\"" + lastUserAnswer + "\"" : "") +
      "\n\nINSTRUCTION\n" + stateInstruction +
      "\n\nRespond with JSON only.";

    const msg = await anthropic.messages.create({
      model: HAIKU,
      max_tokens: 500,
      system: CONVERSATION_FRAMEWORK,
      messages: [{ role: "user", content: userPrompt }],
    });

    const textBlock = msg.content.find(function (b) { return b.type === "text"; });
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text response from AI");
    }

    let cleaned = textBlock.text.trim();
    cleaned = cleaned.replace(/```json|```/g, "").trim();

    const parsed = JSON.parse(cleaned);

    let text: string = (parsed.text || "").trim();
    text = text.replace(/let'?s change tack[,.\s]*/gi, "").replace(/change tack[,.\s]*/gi, "").trim();
    text = text.replace(/[—–―−‒]/g, ", ");
    text = text.replace(/\s+-\s+/g, ", ");
    text = text.replace(/,\s*,/g, ",");
    text = text.replace(/\s+/g, " ").trim();
    if (text.length > 0 && /^[a-z]/.test(text)) {
      text = text[0].toUpperCase() + text.slice(1);
    }

    const moveOn: boolean = !!parsed.moveOn;
    const finished: boolean = !!parsed.finished;
    const thinAnswer: boolean = !!parsed.thinAnswer;

    let nextQuestionNumber = currentQuestion;
    let nextFollowUps = followUpsThisQuestion;

    if (isFirstMessage) {
      nextQuestionNumber = 1;
      nextFollowUps = 0;
    } else if (moveOn && !finished) {
      nextQuestionNumber = currentQuestion + 1;
      nextFollowUps = 0;
    } else if (!moveOn) {
      nextFollowUps = followUpsThisQuestion + 1;
    }

    return NextResponse.json({
      ok: true,
      text,
      questionNumber: nextQuestionNumber,
      followUpsThisQuestion: nextFollowUps,
      finished,
      thinAnswer,
    });
  } catch (e: any) {
    console.error("pitch-next-question error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to generate next question" },
      { status: 500 }
    );
  }
}
