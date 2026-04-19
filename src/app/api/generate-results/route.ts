import { NextRequest, NextResponse } from "next/server";
import { anthropic, HAIKU } from "@/lib/anthropic";
import type { CVData, Message } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  cvData: CVData;
  conversation: Message[];
};

const RESULTS_PROMPT = `You are RoleMatch, a thoughtful UK career consultant. You've just had a voice conversation with a user about what kind of work would genuinely fit them. Now you generate their personalised role recommendations.

CRITICAL: Generate the JSON tightly. No explanatory text outside the JSON. No comments. No code fences. Be efficient with words inside JSON values. The whole response should be under 4000 tokens. No em dashes or en dashes anywhere.

You will be given:
- Their CV data
- Their loved skills (ranked, #1 most loved)
- Their avoid skills (rather not use much)
- The full transcript of your conversation with them

Return EXACTLY this JSON structure:

{
  "summary": "A 3-4 sentence summary in your own voice that captures what you heard from them. Reference specific things they actually said. This proves to the user that you listened. Start with 'From our chat I heard that...' or similar opener. Warm and accurate.",
  "roles": [
    {
      "title": "Role title",
      "category": "recommended | consider",
      "matchScore": 0-100,
      "consultantParagraph": "3-4 sentences. Sound like a thoughtful careers advisor explaining why this role and what they would need. Reference SPECIFIC things from the conversation. Mention what experience they bring, what they would need to develop, and what makes this role a real possibility for them. Personal, interesting, not corporate.",
      "whyUnexpected": "ONLY for consider roles. One sentence explaining why this role might not be on their radar but actually fits. Skip this field for recommended roles.",
      "yourStrengths": ["3-4 specific skills or experiences from their CV that map to this role"],
      "developmentGaps": ["1-2 honest gaps they would need to close. Be specific."],
      "nextStep": "One concrete suggestion. UK course provider, certification, type of entry role to target, or specific action this month.",
      "salary": {
        "entry": "string like £25-32k for someone new to this role in the UK",
        "established": "string like £35-45k for 3-7 years in the role in the UK",
        "senior": "string like £50-70k for senior or lead level in the UK",
        "startingTier": "entry | established | senior"
      }
    }
  ]
}

REQUIREMENTS

1. Return EXACTLY 5 roles in this order:
   - 3 RECOMMENDED roles first (direct fits and stretch fits where their experience and stated preferences clearly point). Order them strongest match first within this group.
   - 2 CONSIDER roles last (lateral moves into different sectors where skills genuinely transfer). Order them strongest match first within this group.

2. matchScore is 0-100. The strongest recommended role should be highest (typically 80-95). The two consider roles should be lower (typically 55-75) because they require more imagination from the user. Use the score to reflect how well the role matches what they said they want plus what their CV proves they can do. Within each section, sort highest score first.

3. Consider roles are the magic moment. They should be sectors or job families the user almost certainly hasn't thought about, BUT where the skills genuinely transfer. Examples: a retail manager moving to operations management at a SaaS company. A teacher moving to L&D at a corporate. A hospitality manager moving to event coordination at a charity. The unexpected role should feel revealing, not random.

4. Use British English. Use £ for salary. UK job titles. UK course providers only (Coursera UK, FutureLearn, Open University, City & Guilds, CIPD, ILM, AAT, etc).

5. Calibrate salaries realistically for the UK in 2025-2026. Be honest. Don't inflate London numbers if the user is regional. The startingTier should reflect their actual experience level for THIS specific role. Someone with 8 years of retail experience pivoting to a totally new sector starts at "entry" for that new sector even if they're "established" in retail.

6. The consultant paragraph must reference specific things from the conversation. If they said they loved coaching at Tesco, reference it. If they said they want to stay in the West Midlands, reference it. Never write generic content.

7. The user's #1 loved skill must be honoured in at least 2 of the 5 roles. The avoid skills must be respected: don't recommend roles where the avoid skills are central.

8. Lifestyle constraints from the conversation must be respected. If they said they want hybrid working and live near Birmingham, don't suggest a London-only office role.

9. AVOID these phrases: "amazing", "love that", "100%", "for sure", "absolutely", "totally", "passionate". No emoji. No exclamation marks. No em dashes. No en dashes.

10. Salary ranges should be wider rather than narrow (e.g. "£28-36k" not "£32k") to be defensible across regions and employers.

11. The "developmentGaps" should be honest but not depressing. Frame as growth areas, not deficiencies. Example: "Stronger commercial finance fundamentals" not "Lacks finance knowledge".`;

export async function POST(req: NextRequest) {
  try {
    const body: Body = await req.json();
    const { cvData, conversation } = body;

    if (!cvData || !conversation) {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
    }

    const lovedSkillsLine =
      cvData.lovedSkills && cvData.lovedSkills.length > 0
        ? cvData.lovedSkills.map((s, i) => i + 1 + ". " + s).join("; ")
        : "(none specified)";

    const avoidSkillsLine =
      cvData.avoidSkills && cvData.avoidSkills.length > 0
        ? cvData.avoidSkills.join(", ")
        : "(none specified)";

    const cvLines = [
      "Name: " + cvData.name,
      "Current role: " + cvData.currentRole,
      "Sector: " + cvData.sector,
      "Years of experience: " + cvData.yearsExperience,
      "Key skills: " + cvData.keySkills.join(", "),
      "LOVED SKILLS (ranked, #1 most loved): " + lovedSkillsLine,
      "AVOID SKILLS (rather not use much): " + avoidSkillsLine,
      "Education: " + cvData.education,
      "Notable employers: " + cvData.notableEmployers.join(", "),
    ];
    const cvSummary = cvLines.join("\n");

    const conversationLog = conversation
      .map((m) => (m.role === "ai" ? "RoleMatch" : "User") + ": " + m.text)
      .join("\n\n");

    const userPrompt =
      "CV DATA\n" +
      cvSummary +
      "\n\nFULL CONVERSATION TRANSCRIPT\n" +
      conversationLog +
      "\n\nNow generate their 5 role recommendations as JSON. Remember: 3 recommended first, then 2 consider. Sort each group by matchScore descending. Reference specific things they said. UK salaries. British English. JSON only.";

    const msg = await anthropic.messages.create({
      model: HAIKU,
      max_tokens: 5000,
      system: RESULTS_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const textBlock = msg.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text response from AI");
    }

    let cleaned = textBlock.text.trim();
    cleaned = cleaned.replace(/```json|```/g, "").trim();

    const data = JSON.parse(cleaned);

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    console.error("generate-results error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to generate results" },
      { status: 500 }
    );
  }
}
