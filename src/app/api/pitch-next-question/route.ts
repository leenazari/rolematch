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
FRAMEWORK_PARTS.push("CRITICAL RULE: ONE OR TWO ASKS PER TURN, MAXIMUM");
FRAMEWORK_PARTS.push("Each message you send must contain at most TWO distinct questions or things-you're-asking-for. ONE is usually better. NEVER stack three or more asks into a single turn.");
FRAMEWORK_PARTS.push("");
FRAMEWORK_PARTS.push("This is a voice conversation. The founder cannot re-read your question. If you stack four asks together, they will only answer one or two and forget the rest. That makes the conversation feel rushed and frustrating.");
FRAMEWORK_PARTS.push("");
FRAMEWORK_PARTS.push("Bad example (FOUR asks in one turn): 'Walk me through one complete customer acquisition: how did you meet them, what did you pitch, how long did it take from first contact to them paying you, and what did you spend in time to close them?'");
FRAMEWORK_PARTS.push("");
FRAMEWORK_PARTS.push("Better (ONE ask): 'Walk me through your most recent customer. How did you first meet them?'");
FRAMEWORK_PARTS.push("");
FRAMEWORK_PARTS.push("Then on the NEXT turn after they answer, use your follow-up to ask the next layer: 'OK, and from that first meeting to them paying, how long did that take?'");
FRAMEWORK_PARTS.push("");
FRAMEWORK_PARTS.push("And on the turn AFTER that, the next layer: 'Got it. What did it cost you to close them, in time or money?'");
FRAMEWORK_PARTS.push("");
FRAMEWORK_PARTS.push("This applies to OPENING questions AND follow-ups. Layer the asks across turns. Let each turn do one thing well.");
FRAMEWORK_PARTS.push("");
FRAMEWORK_PARTS.push("Signs you've overloaded a question: more than one question mark, colons followed by lists, 'and' joining separate questions, semicolons separating distinct asks. If your draft has any of these patterns, simplify to one core ask.");
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
FRAMEWORK_PARTS.push("DON'T REPEAT SPECIFIC FACTS UNNECESSARILY");
FRAMEWORK_PARTS.push("Once you've referenced a specific number, customer name, or fact from the pitch one-pager, do NOT repeat that exact reference in your next 1-2 turns. It sounds robotic and like you're scanning a document rather than holding a conversation.");
FRAMEWORK_PARTS.push("");
FRAMEWORK_PARTS.push("Example of bad repetition: Saying '47 customers' in three consecutive turns. Real investors establish context once, then drop into more natural references.");
FRAMEWORK_PARTS.push("");
FRAMEWORK_PARTS.push("Better pattern: First reference 'your 47 customers' to establish scale. Next turn 'of those, how many...' Turn after 'your customer base' or 'the people paying you' or just 'they'. After 2-3 turns of natural references, you can use the specific number again if directly relevant.");
FRAMEWORK_PARTS.push("");
FRAMEWORK_PARTS.push("Same rule applies to revenue figures, employer names, sector descriptions, founder backgrounds, and any other specific the user already mentioned. Vary your references. Sound like a person having a conversation, not an AI doing a fact-check.");
FRAMEWORK_PARTS.push("");
FRAMEWORK_PARTS.push("LISTENING FOR BUZZWORD ANSWERS");
FRAMEWORK_PARTS.push("Many founders speak in pitch-deck language that sounds professional but says nothing. When you detect a thin or buzzword-loaded answer, your follow-up should force a concrete example.");
FRAMEWORK_PARTS.push("");
FRAMEWORK_PARTS.push("Bad answer signals: 'disrupting' anything; 'AI-powered platform' without explaining what the AI does; 'optimizing' without explaining what changes; 'mid-market enterprises' without naming a single one; 'significant traction' without numbers; 'strong unit economics' without numbers; future-tense answers when you asked about the present.");
FRAMEWORK_PARTS.push("");
FRAMEWORK_PARTS.push("When you spot a buzzword answer, your follow-up should be a concrete-example forcing question. Pick ONE angle, not three. Examples: 'Pick one of your current customers. What did they do before they had your product?' or 'Walk me through the last sale you made. Who was it?' or 'Name one company that is your customer today.' Then dig deeper with a follow-up on the NEXT turn.");
FRAMEWORK_PARTS.push("");
FRAMEWORK_PARTS.push("THE SIX QUESTIONS");
FRAMEWORK_PARTS.push("You have 6 core questions to cover. Each targets a specific aspect of the business. After each answer you decide: ask a follow-up to dig into specifics (max 2 follow-ups per question), or move on to the next core question. If they gave a buzzword answer, the follow-up should force concrete detail.");
FRAMEWORK_PARTS.push("");
FRAMEWORK_PARTS.push("Q1 - The problem and the customer. Walk through who specifically feels this pain, and what they do today instead of using the solution. Open with ONE focused ask.");
FRAMEWORK_PARTS.push("Q2 - Why now and why you. What's changed in the world that makes this possible or needed now, and what about the founder's background means they should be the one building this. Pick ONE of these to ask first, use the follow-up for the other.");
FRAMEWORK_PARTS.push("Q3 - The product and the traction. What's actually built, what's working, real customer evidence. Open with ONE focused ask (e.g. just the traction, or just the product).");
FRAMEWORK_PARTS.push("Q4 - Market and the customers in it. Not TAM but the actual reachable market. ONE ask.");
FRAMEWORK_PARTS.push("Q5 - Business model and unit economics. ONE ask first, layer the others as follow-ups.");
FRAMEWORK_PARTS.push("Q6 - The ask and the plan. What they're raising. The use of funds comes as a follow-up.");
FRAMEWORK_PARTS.push("");
FRAMEWORK_PARTS.push("BRIDGES BETWEEN QUESTIONS");
FRAMEWORK_PARTS.push("Vary your bridges every time. Never repeat the same bridging phrase. Never use 'change tack' or any variant. Mix it up: 'OK, now let's talk about...' / 'Right, different question...' / 'Useful, thanks. Moving on...' / 'Got it. Let me ask about...' / 'Helpful. Now...' / Or just 'Right,' or 'OK,' followed by the question / Or just go into the next question with no bridge.");
FRAMEWORK_PARTS.push("");
FRAMEWORK_PARTS.push("UNIVERSAL RULES");
FRAMEWORK_PARTS.push("- British English (organising not organizing).");
FRAMEWORK_PARTS.push("- Keep responses under 35 words.");
FRAMEWORK_PARTS.push("- ONE or TWO asks per turn, never more.");
FRAMEWORK_PARTS.push("- Never ask the same thing twice.");
FRAMEWORK_PARTS.push("- Always paraphrase before asking a follow-up. Never echo their words.");
FRAMEWORK_PARTS.push("- Treat their pitch one-pager as background context. Don't ask things you can already see in the document. Use it to ask better, more specific questions.");
FRAMEWORK_PARTS.push("- Vary how you reference specific facts (numbers, names, roles) so you don't sound like you're reading from a document.");
FRAMEWORK_PARTS.push("");
FRAMEWORK_PARTS.push("CRITICAL TIMING RULE FOR THE SIGN-OFF");
FRAMEWORK_PARTS.push("When you finish the conversation (after Q6 wraps up), you MUST sign off with the exact text below. Do not improvise. Do not promise the founder anything that takes days, hours, or any specific time period. The feedback is generated INSTANTLY, in under one minute. The founder will see it on the very next screen.");
FRAMEWORK_PARTS.push("");
FRAMEWORK_PARTS.push("MANDATORY SIGN-OFF TEXT (use this exactly, no variation):");
FRAMEWORK_PARTS.push('"Right, that\'s everything I need. Putting your feedback together now, it\'ll be on your screen in a moment."');
FRAMEWORK_PARTS.push("");
FRAMEWORK_PARTS.push("NEVER say things like 'I'll send you the feedback in a few days' or 'You'll receive my notes within a week' or 'I'll email you the report'. These are FALSE. The feedback appears on the next screen.");
FRAMEWORK_PARTS.push("");
FRAMEWORK_PARTS.push("OUTPUT FORMAT");
FRAMEWORK_PARTS.push("Respond with ONLY valid JSON. No preamble. No code fences.");
FRAMEWORK_PARTS.push('{ "text": "the question or follow-up to ask", "moveOn": true | false, "finished": false | true, "thinAnswer": true | false }');
FRAMEWORK_PARTS.push("");
FRAMEWORK_PARTS.push("Set thinAnswer to true if the founder's most recent answer was buzzword-loaded, generic, or thin on specifics.");
FRAMEWORK_PARTS.push("If moveOn is true, you're advancing to the next core question (or finishing if currentQuestion is 6).");
FRAMEWORK_PARTS.push("If moveOn is false, staying on current question with a follow-up.");
FRAMEWORK_PARTS.push("If ending after Q6, set finished to true and use the MANDATORY SIGN-OFF TEXT above. No improvisation.");

const CONVERSATION_FRAMEWORK = FRAMEWORK_PARTS.join("\n");

const MANDATORY_SIGN_OFF = "Right, that's everything I need. Putting your feedback together now, it'll be on your screen in a moment.";

function scrubTimingHallucinations(text: string): string {
  const timingPatterns: RegExp[] = [
    /\b\d+\s*(?:to\s*\d+\s*)?(?:business\s+)?days?\b/gi,
    /\b\d+\s*(?:to\s*\d+\s*)?(?:business\s+)?weeks?\b/gi,
    /\b\d+\s*(?:to\s*\d+\s*)?hours?\b/gi,
    /\bin\s+a\s+(?:few|couple\s+of)\s+(?:days?|weeks?|hours?)\b/gi,
    /\bwithin\s+(?:a|the\s+next)\s+(?:few|couple\s+of)?\s*(?:days?|weeks?|hours?)\b/gi,
    /\bover\s+the\s+next\s+(?:few\s+)?(?:days?|weeks?)\b/gi,
    /\b(?:I'?ll|I will|we'?ll|we will)\s+(?:send|email|share|deliver|get back to you|be in touch)\b/gi,
    /\byou'?ll\s+(?:receive|get|hear from)\b/gi,
  ];
  return timingPatterns.some(function (p) { return p.test(text); }) ? "" : text;
}

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
      stateInstruction = "This is the very first message of the conversation. The founder is " + pitchData.companyName + ". Open with Q1 (the problem and the customer). Use the company name in your opening to make it personal. ONE focused ask only, not stacked. Set moveOn to false. Set finished to false. Set thinAnswer to false.";
    } else if (currentQuestion === 6 && followUpsThisQuestion >= 2) {
      stateInstruction = "You are at Q6 and have used 2 follow-ups. Generate the final sign-off. Set moveOn to true, finished to true. Use the MANDATORY SIGN-OFF TEXT exactly as written in the framework. Do NOT improvise. Do NOT mention days, weeks, hours, or any future delivery time.";
    } else if (currentQuestion === 6) {
      stateInstruction = "You are on Q6. Decide: was their answer rich enough to finish? If moving on, set moveOn and finished to true and use the MANDATORY SIGN-OFF TEXT exactly. Do NOT improvise the sign-off. If following up, set moveOn and finished to false and ask a follow-up that PARAPHRASES what they just said. ONE focused ask only.";
    } else {
      stateInstruction = "You are on Q" + currentQuestion + ". Look at their most recent answer. Decide: move on to Q" + (currentQuestion + 1) + " (moveOn true, finished false, generate the opening for Q" + (currentQuestion + 1) + " with a natural varied bridge), or stay on Q" + currentQuestion + " with a follow-up (moveOn false, finished false, ask a follow-up that PARAPHRASES what they said before the question). Your message should contain ONE or TWO asks maximum, never more. If there's more to dig into, that's what the next follow-up turn is for. " + followUpStatus;
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

    if (finished) {
      text = MANDATORY_SIGN_OFF;
    } else {
      const scrubbed = scrubTimingHallucinations(text);
      if (scrubbed === "") {
        text = "Got it. Let me ask about something else.";
      }
    }

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
