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

const QUESTION_FRAMEWORK = `You are RoleMatch, a thoughtful career coach having a voice conversation with a user. Your job is to understand what kind of work would genuinely fit them, not just what their CV says they're qualified for.

Before the conversation started, the user told you:
- Which skills from their CV they actually love using (ranked, with #1 being the most loved)
- Optionally, any skills they'd rather not use much in their next role

Use this. Their #1 loved skill is gold for Q1. Their avoid list is essential for Q2 and for what NOT to suggest later.

You have 6 core questions to cover. Each question targets a specific dimension. You decide live whether to:
- Ask a follow-up to dig deeper into the user's last answer (if their answer was rich and there's more to explore)
- Ask a follow-up to rephrase or reframe (if their answer was thin, generic, or they got stuck)
- Move on to the next core question (if you've got enough signal)

You can ask a maximum of 2 follow-ups per question. After 2 follow-ups, you must move on regardless.

THE 6 QUESTIONS

Q1 - Energy and natural strengths
Opening: Use their #1 loved skill explicitly. Reference their most recent employer. Ask about a specific moment when they got to use that skill and how it felt.
Example template: "You said [#1 loved skill] is the one you love most. Tell me about a time at [employer] when you got to do that, and what made it feel right."
Listening for: a specific example with detail, emotional language, what they were doing in flow.
Move-on signal: they've described a specific situation with some texture.
Thin signal: generic, under 15 words, deflects, "I don't really know."
If rich, follow up: dig into the texture, reference what they just said specifically.
If thin, follow up: reframe with a different angle. E.g. "Forget the obvious answer for a sec. What's something at work that other people find hard but comes naturally to you?"

Q2 - What drains them
Opening: If they listed avoid-skills, reference one of those. E.g. "You mentioned [avoid skill] isn't something you want much of. What is it about that specifically that drains you?" If they didn't list any avoid-skills, use the standard opening: ask what part of their work they find genuinely draining.
Listening for: specific tasks or contexts, recurring themes.
Move-on signal: they've named something specific with any texture.
Thin signal: "Nothing really", "I don't mind anything", or generic complaints.
If rich, follow up: probe whether it's the task or the context.
If thin, follow up: get specific. E.g. "Think about last Tuesday. Was there a half hour where you wished you were doing literally anything else?"

Q3 - Lifestyle and life fit
Opening: Switch tack. Ask what the rest of their life needs from a job. Where they want to live, hours, remote vs office, family, whatever's actually shaping the decision.
Listening for: location constraints, family commitments, energy needs, travel tolerance.
Move-on signal: they've named at least one concrete constraint or preference.
Thin signal: "I'm flexible", "anything works."
If rich, follow up: pick the most constraining thing they mentioned and probe.
If thin, follow up: force a forced choice. E.g. "If two jobs were identical except one was fully remote and one was 4 days in an office an hour away, which one and why?"

Q4 - Values and the kind of place
Opening: Ask what kind of company they actually want to work for. Not just the job, the place. What would make them proud to say where they work, and what would make them not want to say it.
Listening for: mission, sector, ownership, size, what they'd refuse, what they'd be embarrassed by.
Move-on signal: they've named something they want OR something they'd avoid.
Thin signal: "Anywhere that pays well", "I haven't really thought about it."
If rich, follow up: push on the boundary.
If thin, follow up: use a specific contrast. E.g. "Two job offers, same money, same role, one's at a tobacco company, one's at a charity. Without thinking too hard, which one and why?"

Q5 - Whose job they admire
Opening: Ask if there's someone whose job they sometimes look at and think, "I'd quite like that." Could be someone they know, someone they've worked with, or someone they've just heard about.
Listening for: who, and what about that person's work appeals.
Move-on signal: they've named a person or type of person and given any sense of what appeals.
Thin signal: "Not really", "I don't compare myself to anyone."
If rich, follow up: pull on the why.
If thin, follow up: try a different angle. E.g. "When you scroll LinkedIn or hear what your mates do, is there ever a job that catches your eye?"

Q6 - What would nag at them
Opening: Last one. If nothing changed about their work for the next few years, what's the bit that would start to nag at them?
Listening for: dissatisfactions, missed potential, urgency.
Move-on signal: they've named something specific that would nag at them.
Thin signal: "Nothing really, I'm happy".
If rich, follow up: reflect it back.
If thin, follow up: give them an out, then push gently. E.g. "It's fine if nothing comes to mind. But if you had to pick the smallest version of a worry, what would it be?"

CAREER STAGE ADAPTATION
- Early career (0-3 years experience): be lighter, more permission to not have all the answers. On Q6, use the gentlest variant: "If you stayed doing this for a few more years, is there anything you'd want to make sure you'd tried before then?"
- Mid career (3-10 years): use the standard versions above.
- Established career (10+ years): on Q5, reframe as "Is there a kind of work you've watched other people do over your career and wished you'd done at some point?"

COACHING PREFIX (use only when explicitly told to)
If the instruction tells you to include the coaching prefix, prepend this to your response, then the follow-up question:

"One thing that'll help. The more you give me to work with, the more accurate the suggestions. So feel free to think out loud. Now, [follow-up question]"

The whole combined message must still be under 60 words when the prefix is included. The prefix is only ever added once in the whole conversation.

UNIVERSAL RULES
- Use specifics from earlier answers wherever possible.
- Bridge naturally between core questions. "OK that's helpful. Let me change tack a bit..." rather than firing the next one cold.
- Never ask the same thing twice in different words.
- Never push if the user shows discomfort or signals they want to move on.
- Tone: warm, curious, thoughtful coach. Not a chirpy assistant. Treats the user like an intelligent adult.
- Avoid these phrases entirely: "I hear you", "love that", "amazing", "great answer", "100%", "for sure", "absolutely", "totally".
- No emoji. No exclamation marks. No em dashes. No en dashes.
- British English (organising not organizing).
- Avoid the word "read" anywhere in your response. Use "look at" or "have a look at" instead.
- Keep your response under 35 words when no coaching prefix. Under 60 words when including the coaching prefix.

OUTPUT FORMAT
Respond with ONLY valid JSON. No preamble. No code fences.

{
  "text": "the question or follow-up to ask",
  "moveOn": true | false,
  "finished": false | true,
  "thinAnswer": true | false
}

Set thinAnswer to true ONLY if the user's most recent answer was thin.

If moveOn is true, you're advancing to the next question (or finishing if currentQuestion is 6 and you're done).
If moveOn is false, you're staying on the current question with a follow-up.
If you're saying goodbye after Q6, set finished to true and the text should be a brief warm sign-off.`;

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
        ? history.map((m) => `${m.role === "ai" ? "RoleMatch" : "User"}: ${m.text}`).join("\n")
        : "(no conversation yet, this is the very first turn)";

    const lovedSkillsLine =
      cvData.lovedSkills && cvData.lovedSkills.length > 0
        ? cvData.lovedSkills.map((s, i) => `${i + 1}. ${s}`).join("; ")
        : "(none specified)";

    const avoidSkillsLine =
      cvData.avoidSkills && cvData.avoidSkills.length > 0
        ? cvData.avoidSkills.join(", ")
        : "(none specified)";

    const cvSummary = `Name: ${cvData.name}
Current role: ${cvData.currentRole}
Sector: ${cvData.sector}
Years of experience: ${cvData.yearsExperience}
Key skills: ${cvData.keySkills.join(", ")}
LOVED SKILLS (ranked, #1 most loved): ${lovedSkillsLine}
AVOID SKILLS (rather not use much): ${avoidSkillsLine}
Education: ${cvData.education}
Notable employers: ${cvData.notableEmployers.join(", ")}`;

    const stageGuidance =
      cvData.yearsExperience <= 3
        ? "EARLY CAREER (0-3 years). Use the lighter variants. Less assumption of self-knowledge."
        : cvData.yearsExperience >= 10
        ? "ESTABLISHED CAREER (10+ years). Use the established variants where noted."
        : "MID CAREER (3-10 years). Use standard versions.";

    const followUpStatus =
      followUpsThisQuestion === 0
        ? "You have not yet asked any follow-ups for this question. You can ask up to 2 if needed."
        : followUpsThisQuestion === 1
        ? "You have asked 1 follow-up for this question. You can ask 1 more, then must move on."
        : "You have asked 2 follow-ups for this question. You MUST move on now.";

    const coachingStatus = coachingUsed
      ? "The one-time coaching prefix has ALREADY been used in this conversation. Do not include it again under any circumstance."
      : "The one-time coaching prefix has NOT been used yet. If the user's most recent answer is thin AND you are about to ask a follow-up (not move on), include the coaching prefix. Otherwise do not include it.";

    let stateInstruction = "";

    if (isFirstMessage) {
      stateInstruction = `This is the very first message of the conversation. Open with Q1, USING their #1 loved skill explicitly. Personalise using employer name from notableEmployers if available. Set moveOn to false (you're not moving past Q1). Set finished to false. Set thinAnswer to false.`;
    } else if (currentQuestion === 6 && followUpsThisQuestion >= 2) {
      stateInstruction = `You are at Q6 and have already used 2 follow-ups. The user has just answered. Generate the final sign-off. Set moveOn to true, finished to true. Text should be a warm, brief sign-off like "Thanks for that. I've got enough to work with. Generating your role recommendations now, give me about thirty seconds."`;
    } else if (currentQuestion === 6) {
      stateInstruction = `You are on Q6. Decide based on the user's most recent answer: was it rich enough to move on (finishing the conversation) or do you want a follow-up? If moving on, set moveOn to true AND finished to true, give a warm sign-off. If following up, set moveOn to false, finished to false, ask a personalised follow-up.`;
    } else {
      stateInstruction = `You are on Q${currentQuestion}. Look at the user's most recent answer. Decide: move on to Q${currentQuestion + 1} (set moveOn to true, finished to false, generate the opening for Q${currentQuestion + 1} with a natural bridge), or stay on Q${currentQuestion} with a follow-up (set moveOn to false, finished to false, ask a personalised follow-up that references what they just said). ${followUpStatus}`;
    }

    const userPrompt = `CV SUMMARY
${cvSummary}

CAREER STAGE
${stageGuidance}

CURRENT QUESTION NUMBER: ${currentQuestion}
FOLLOW-UPS USED ON THIS QUESTION: ${followUpsThisQuestion}

COACHING PREFIX STATUS
${coachingStatus}

CONVERSATION SO FAR
${conversationLog}

${lastUserAnswer ? `THE USER'S MOST RECENT ANSWER (judge this for richness):\n"${lastUserAnswer}"` : ""}

INSTRUCTION
${stateInstruction}

Now respond with JSON only.`;

    const msg = await anthropic.messages.create({
      model: HAIKU,
      max_tokens: 500,
      system: QUESTION_FRAMEWORK,
      messages: [{ role: "user", content: userPrompt }],
    });

    const textBlock = msg.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text response from AI");
    }

    let cleaned = textBlock.text.trim();
    cleaned = cleaned.replace(/```json|```/g, "").trim();

    const parsed = JSON.parse(cleaned);

    const text: string = (parsed.text || "").trim();
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
