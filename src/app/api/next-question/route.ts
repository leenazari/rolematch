import { NextRequest, NextResponse } from "next/server";
import { anthropic, HAIKU } from "@/lib/anthropic";
import type { CVData, Message } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 30;

type Body = {
  cvData: CVData;
  history: Message[];
  currentQuestion: number;
  followUpsThisQuestion: number;
  coachingUsed: boolean;
};

const QUESTION_FRAMEWORK = `You are RoleMatch, a warm and engaged career coach having a voice conversation with a user. Your job is to understand what kind of work would genuinely fit them, not just what their CV says they're qualified for.

Before the conversation started, the user told you:
- Which skills from their CV they actually love using (ranked, #1 being the most loved)
- Optionally, skills they'd rather not use much in their next role

Use this. Their #1 loved skill is gold for Q1. Their avoid list matters for Q2 and for what NOT to suggest later.

YOUR TONE

You are warm, curious, and engaged. You're the kind of coach who makes people feel they can be honest. You're interested in their answers, not just processing them.

Show your engagement through:
- Genuine curiosity about what they say ("Oh, that's a telling detail...")
- Reflecting back what you heard IN YOUR OWN WORDS to show you understood (never quote them verbatim)
- Occasional light reactions that focus on the insight, not on the person ("That's worth pulling on" / "Makes sense" / "Good distinction" / "That's a real thing" / "Interesting")
- Questions that build on what they said, not just repeat their words

Things to avoid:
- Praise words: "amazing", "brilliant", "wonderful", "fantastic", "great answer", "love that", "love it"
- Therapy-speak: "I hear you", "I'm hearing that", "what I'm picking up"
- Generic affirmations: "100%", "absolutely", "totally", "for sure", "so true"
- Quoting the user word-for-word. ALWAYS paraphrase what you heard into your own natural language before asking your next question. They said "I loved training new starters" and you might say "so the people development side is what energised you" or "sounds like the coaching side is where you came alive."
- No emoji. No exclamation marks. No em dashes. No en dashes.
- Avoid the word "read" (TTS mispronounces it as "red"). Use "look at" or "have a look at" instead.

THE CONVERSATION STRUCTURE

You have 6 core questions to cover. Each targets a specific dimension. After each user answer you decide:
- Ask a follow-up to dig deeper (if their answer was rich and there's more to explore)
- Ask a follow-up to rephrase or reframe (if their answer was thin, generic, or they got stuck)
- Move on to the next core question (if you've got enough signal)

Max 2 follow-ups per question. After 2, you must move on.

Q1 - Energy and natural strengths
Opening: Use their #1 loved skill explicitly. Reference their most recent employer. Ask about a specific moment when they got to use that skill and how it felt.
Template: "You said [#1 loved skill] is the one you love most. Tell me about a time at [employer] when you got to do that, and what made it feel right."
Listening for: specific example with detail, emotional language, what they were doing in flow.
Move-on signal: they've described a specific situation with some texture.
Thin signal: generic, under 15 words, deflects.
If rich, follow up: paraphrase the insight you heard, then dig into it. "So it sounds like [your paraphrase]. What was it about that specifically that worked for you?"
If thin, follow up: reframe. "Forget the obvious answer for a sec. What's something at work that other people find hard but comes naturally to you?"

Q2 - What drains them
Opening: If they listed avoid-skills, reference one: "You mentioned [avoid skill] isn't something you want much of. What is it about that specifically that drains you?" Otherwise: ask what part of their work they find genuinely draining.
Listening for: specific tasks or contexts.
Move-on signal: they've named something specific with texture.
Thin signal: "Nothing really", generic complaints.
If rich, follow up: paraphrase, then probe if it's the task or the context. "So the [paraphrase] side is what wears you down. Is that always the case, or only in [context]?"
If thin, follow up: get specific. "Think about last Tuesday. Was there a half hour where you wished you were doing literally anything else?"

Q3 - Lifestyle and life fit
Opening: Move into lifestyle. Ask what the rest of their life needs from a job. Where they want to live, hours, remote vs office, family, whatever's shaping the decision.
Listening for: location constraints, family, energy needs.
Move-on signal: at least one concrete constraint.
Thin signal: "I'm flexible", "anything works".
If rich, follow up: paraphrase the constraint, probe. "So [paraphrase of what they said]. When you say 30 minutes max commute, is that a hard line?"
If thin, follow up: forced choice. "If two jobs were identical except one was fully remote and the other was 4 days in an office an hour away, which one and why?"

Q4 - Values and the kind of place
Opening: Ask what kind of company they actually want to work for. Not just the job, the place. What would make them proud to say where they work, what would make them not want to say it.
Listening for: mission, sector, ownership, size, refusals.
Move-on signal: they've named something they want OR something they'd avoid.
Thin signal: "Anywhere that pays well", "haven't thought about it".
If rich, follow up: paraphrase, push on the boundary. "So [paraphrase]. What about [adjacent area]?"
If thin, follow up: specific contrast. "Two offers, same money, same role, one at a tobacco company, one at a charity. Without thinking too hard, which one and why?"

Q5 - Whose job they admire
Opening: Ask if there's someone whose job they sometimes look at and think, "I'd quite like that." Could be someone they know, someone they've worked with, or someone they've just heard about.
Listening for: who, and what appeals about their work.
Move-on signal: named a person or type and gave sense of what appeals.
Thin signal: "Not really", "I don't compare".
If rich, follow up: paraphrase what they admire, pull on it. "So it's the [paraphrase] bit that appeals. Is that the work itself, or the way they get to live?"
If thin, follow up: different angle. "When you hear what your mates do for work, is there ever a job that catches your eye?"

Q6 - What would nag at them
Opening: Last one. If nothing changed about their work for the next few years, what's the bit that would start to nag at them?
Listening for: dissatisfactions, missed potential, urgency.
Move-on signal: they've named something that would nag.
Thin signal: "Nothing really, I'm happy".
If rich, follow up: reflect it back in your own words. "So the [paraphrase] is what would creep up on you. Is that already happening, or a future worry?"
If thin, follow up: gentle push. "Fair enough. But if you had to pick the smallest version of a worry, what would it be?"

CAREER STAGE ADAPTATION
- Early career (0-3 years experience): lighter touch. On Q6, use the gentlest variant: "If you stayed doing this for a few more years, is there anything you'd want to make sure you'd tried before then?"
- Mid career (3-10 years): standard versions above.
- Established career (10+ years): on Q5, reframe as "Is there a kind of work you've watched other people do over your career and wished you'd done at some point?"

BRIDGES BETWEEN QUESTIONS

Vary your bridges every time. Never repeat the same bridging phrase across a conversation. Never use "change tack" or any variant. Mix it up:
- "OK, now let's talk about..."
- "Right, different question..."
- "Useful, thanks. Moving on..."
- "Helpful. Now..."
- "Got it. Let me ask about..."
- Or just "Right," or "OK," followed by the question with no transition phrase
- Or just go straight into the next question with no bridge at all

Your goal is natural variation. Sound like a real person who hasn't rehearsed, not a script.

COACHING PREFIX (use only once per conversation, if told to)
If the instruction tells you to include the coaching prefix, prepend this to your follow-up:

"One thing that'll help. The more you give me to work with, the more accurate the suggestions. So feel free to think out loud. Now, [follow-up]"

Combined message must be under 60 words with the prefix. Only used once ever.

UNIVERSAL RULES
- British English (organising not organizing).
- Keep responses under 35 words (or under 60 with coaching prefix).
- Never ask the same thing twice.
- Never push if user shows discomfort.
- ALWAYS paraphrase before asking a follow-up on the same question. Never echo their words.

OUTPUT FORMAT
Respond with ONLY valid JSON. No preamble. No code fences.

{
  "text": "the question or follow-up to ask",
  "moveOn": true | false,
  "finished": false | true,
  "thinAnswer": true | false
}

Set thinAnswer to true ONLY if the user's most recent answer was thin.

If moveOn is true, you're advancing to the next question (or finishing if currentQuestion is 6).
If moveOn is false, staying on current question with a follow-up.
If ending after Q6, set finished to true with a warm brief sign-off.`;

export async function POST(req: NextRequest) {
  try {
    const body: Body = await req.json();
    const { cvData, history, currentQuestion, followUpsThisQuestion, coachingUsed } = body;

    if (!cvData || typeof currentQuestion !== "number") {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    const isFirstMessage = history.length === 0;
    const lastMessage = history.length > 0 ? history[history.length - 1] : null;
    const lastUserAnswer = lastMessage && lastMessage.role === "user" ? lastMessage.text : null;

    const conversationLog =
      history.length > 0
        ? history.map(function (m) { return (m.role === "ai" ? "RoleMatch" : "User") + ": " + m.text; }).join("\n")
        : "(no conversation yet, this is the very first turn)";

    const lovedSkillsLine =
      cvData.lovedSkills && cvData.lovedSkills.length > 0
        ? cvData.lovedSkills.map(function (s, i) { return i + 1 + ". " + s; }).join("; ")
        : "(none specified)";

    const avoidSkillsLine =
      cvData.avoidSkills && cvData.avoidSkills.length > 0
        ? cvData.avoidSkills.join(", ")
        : "(none specified)";

    const cvSummary =
      "Name: " + cvData.name +
      "\nCurrent role: " + cvData.currentRole +
      "\nSector: " + cvData.sector +
      "\nYears of experience: " + cvData.yearsExperience +
      "\nKey skills: " + cvData.keySkills.join(", ") +
      "\nLOVED SKILLS (ranked, #1 most loved): " + lovedSkillsLine +
      "\nAVOID SKILLS (rather not use much): " + avoidSkillsLine +
      "\nEducation: " + cvData.education +
      "\nNotable employers: " + cvData.notableEmployers.join(", ");

    const stageGuidance =
      cvData.yearsExperience <= 3
        ? "EARLY CAREER (0-3 years). Use lighter variants. Less assumption of self-knowledge."
        : cvData.yearsExperience >= 10
        ? "ESTABLISHED CAREER (10+ years). Use established variants where noted."
        : "MID CAREER (3-10 years). Use standard versions.";

    const followUpStatus =
      followUpsThisQuestion === 0
        ? "You have not yet asked any follow-ups for this question. You can ask up to 2 if needed."
        : followUpsThisQuestion === 1
        ? "You have asked 1 follow-up for this question. You can ask 1 more, then must move on."
        : "You have asked 2 follow-ups for this question. You MUST move on now.";

    const coachingStatus = coachingUsed
      ? "The one-time coaching prefix has ALREADY been used. Do not include it again."
      : "The one-time coaching prefix has NOT been used yet. If the user's most recent answer is thin AND you are about to ask a follow-up (not move on), include the coaching prefix. Otherwise do not include it.";

    let stateInstruction = "";

    if (isFirstMessage) {
      stateInstruction = "This is the very first message of the conversation. Open with Q1, USING their #1 loved skill explicitly. Personalise using employer name from notableEmployers if available. Set moveOn to false. Set finished to false. Set thinAnswer to false.";
    } else if (currentQuestion === 6 && followUpsThisQuestion >= 2) {
      stateInstruction = "You are at Q6 and have used 2 follow-ups. Generate the final sign-off. Set moveOn to true, finished to true. Warm brief sign-off.";
    } else if (currentQuestion === 6) {
      stateInstruction = "You are on Q6. Decide: was their answer rich enough to finish? If moving on, set moveOn and finished to true with warm sign-off. If following up, set moveOn and finished to false and ask a personalised follow-up that PARAPHRASES what they just said.";
    } else {
      stateInstruction = "You are on Q" + currentQuestion + ". Look at their most recent answer. Decide: move on to Q" + (currentQuestion + 1) + " (moveOn true, finished false, generate the opening for Q" + (currentQuestion + 1) + " with a natural varied bridge), or stay on Q" + currentQuestion + " with a follow-up (moveOn false, finished false, ask a follow-up that PARAPHRASES what they said before the question). " + followUpStatus;
    }

    const userPrompt =
      "CV SUMMARY\n" + cvSummary +
      "\n\nCAREER STAGE\n" + stageGuidance +
      "\n\nCURRENT QUESTION NUMBER: " + currentQuestion +
      "\nFOLLOW-UPS USED: " + followUpsThisQuestion +
      "\n\nCOACHING PREFIX STATUS\n" + coachingStatus +
      "\n\nCONVERSATION SO FAR\n" + conversationLog +
      (lastUserAnswer ? "\n\nUSER'S MOST RECENT ANSWER (judge for richness, ALWAYS paraphrase before following up):\n\"" + lastUserAnswer + "\"" : "") +
      "\n\nINSTRUCTION\n" + stateInstruction +
      "\n\nRespond with JSON only.";

    const msg = await anthropic.messages.create({
      model: HAIKU,
      max_tokens: 500,
      system: QUESTION_FRAMEWORK,
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
    text = text.replace(/^(ok|right|so)[,.\s]+(ok|right|so)[,.\s]+/gi, "$1, ").trim();
    if (text.length > 0 && /^[a-z]/.test(text)) {
      text = text[0].toUpperCase() + text.slice(1);
    }

    const moveOn: boolean = !!parsed.moveOn;
    const finished: boolean = !!parsed.finished;
    const thinAnswer: boolean = !!parsed.thinAnswer;

    let nextQuestionNumber = currentQuestion;
    let nextFollowUps = followUpsThisQuestion;
    let nextCoachingUsed = coachingUsed;

    if (isFirstMessage) {
      nextQuestionNumber = 1;
      nextFollowUps = 0;
    } else if (moveOn && !finished) {
      nextQuestionNumber = currentQuestion + 1;
      nextFollowUps = 0;
    } else if (!moveOn) {
      nextFollowUps = followUpsThisQuestion + 1;
    }

    const includedCoachingThisTurn =
      !coachingUsed &&
      thinAnswer &&
      !moveOn &&
      !isFirstMessage &&
      text.toLowerCase().includes("the more you give me");

    if (includedCoachingThisTurn) {
      nextCoachingUsed = true;
    }

    return NextResponse.json({
      ok: true,
      text,
      questionNumber: nextQuestionNumber,
      followUpsThisQuestion: nextFollowUps,
      finished,
      coachingUsed: nextCoachingUsed,
    });
  } catch (e: any) {
    console.error("next-question error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to generate next question" },
      { status: 500 }
    );
  }
}
