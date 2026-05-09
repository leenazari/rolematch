"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import PitchUpload from "@/components/PitchUpload";
import PitchConfirm from "@/components/PitchConfirm";
import type { PitchData, PitchMessage } from "@/types";

type Stage = "welcome" | "confirm";

const TEST_PITCH_TILLY: PitchData = {
  companyName: "Tilly",
  oneLineDescription: "iPad-based EPOS and integrated payments platform for independent UK hospitality venues with 1.4 percent flat transaction fees and real-time margin reporting.",
  problem: "Independent UK pubs, cafes, and small restaurants choose between expensive enterprise EPOS systems (£200+/month plus high transaction fees) or basic card readers that don't integrate with their till. Operators waste hours reconciling, can't identify profitable products, and pay 1.7 to 2.2 percent in transaction fees that erode thin margins.",
  targetCustomer: "Independent UK pubs, cafes, and small restaurants turning over £10k to £60k per month who need better financial insights than Square or Sumup but don't justify enterprise EPOS costs.",
  sector: "Fintech",
  stage: "early revenue",
  teamSize: "7 full-time",
  founderBackground: "CEO spent 4 years at Square UK leading SMB EPOS partnerships. CTO spent 5 years at Deliveroo leading merchant tools engineering. COO ran two cafes in Bristol for 8 years. The three met through Founders Forge accelerator in 2024.",
  traction: "47 paying customers growing 12 to 15 per month for 4 months. £2,300 MRR plus £8,400 per month in payment processing revenue. Net revenue retention 108 percent. 4 signed LOIs from small pub chains for Q3.",
  ask: "£750k seed at £4M pre-money valuation. SEIS available for first £250k.",
  rawText: "Tilly EPOS one-pager. Realistic mid-quality seed pitch.",
};

const TEST_CONVERSATION_TILLY: PitchMessage[] = [
  { role: "ai", text: "Right, let's start with the problem. Walk me through who specifically feels this pain at Tilly, and what they do today instead of using your solution.", questionNumber: 1 },
  { role: "user", text: "So we're building Tilly for independent UK hospitality. Pubs, cafes, restaurants doing about £10k to £60k a month. The owner is usually behind the bar themselves. They're using Square or Sumup right now and it's costing them about 1.8 percent on every transaction, plus they have no clue which menu items actually make money. They reconcile takings every Sunday morning by hand and it takes them 2 hours." },
  { role: "ai", text: "Got it, so the operator is hands-on and burning weekend hours on reconciliation. What does the actual switching moment look like, what makes them finally try Tilly?", questionNumber: 1 },
  { role: "user", text: "Usually they switch when they look at their Square fees and realise they're paying £400 a month in fees alone. We're flat 1.4 percent which saves them about £150 a month minimum. Plus the margin reporting. We had a customer last month who realised their bestselling sandwich was actually losing them 30p each because of avocado prices and they only spotted it because of our reports." },
  { role: "ai", text: "Useful. Now, why now and why you. What's changed recently that makes this possible, and what about your background means you should be the one building it?", questionNumber: 2 },
  { role: "user", text: "Open Banking is what makes the unit economics work for us, that wasn't possible 3 years ago. We can do payments at 1.4 percent because we don't need the fraud reserves Square needs. As for us, I was at Square UK for 4 years on the SMB hospitality team, my CTO ran merchant tools engineering at Deliveroo, and our COO actually ran two cafes for 8 years so she lived this problem." },
  { role: "ai", text: "OK, the Open Banking angle is interesting. Let me ask about the product and traction. What's actually built and shipping today, and what real customer evidence do you have?", questionNumber: 3 },
  { role: "user", text: "We have 47 paying customers across the West Midlands and London. £2,300 MRR plus about £8,400 a month in payment processing revenue. Net revenue retention 108 percent. We've been growing 12 to 15 net new customers a month for the last 4 months. We have 4 signed LOIs from pub chains for Q3, each covering 8 to 12 venues." },
  { role: "ai", text: "Right, different question. The market. Forget the global TAM. In the UK alone, how many specific venues could realistically buy this, and where do you find them?", questionNumber: 4 },
  { role: "user", text: "There are roughly 28,000 independent venues in our serviceable UK market. Pubs, cafes, restaurants doing £10k to £60k a month. We find them through a few channels. Direct outreach to local trade associations, partnerships with hospitality consultants, and word of mouth from existing customers. Word of mouth is our biggest channel actually, accounts for about 40 percent of new customers." },
  { role: "ai", text: "Helpful. Let me ask about the business model. If I bought one customer for you, how much do they make you in their first year, and how much did it cost to find them?", questionNumber: 5 },
  { role: "user", text: "Average customer pays us £49 a month for software plus 1.4 percent on their transaction volume. The average venue does about £25k a month in card transactions, so we make about £350 a month per customer total, £4,200 a year. CAC is roughly £600 because most of our growth is word of mouth and direct outreach. Gross margin on the software is 92 percent, on the payments side it's about 35 percent after interchange." },
  { role: "ai", text: "Got it. Last one. What are you raising and what does the next 18 months look like with that money?", questionNumber: 6 },
  { role: "user", text: "We're raising £750k seed at £4M pre-money. £280k for GTM, two sales hires and a senior marketer. £320k for engineering, two senior engineers to ship the inventory module and multi-site dashboards. £150k runway. By end of 18 months we want to be at 400 paying venues, £25k MRR plus £35k a month payments, multi-site dashboard live to unlock the small chain segment." },
  { role: "ai", text: "Right, that's everything I need. I'm going to put together my notes for you now. Should take about a minute.", questionNumber: 6 },
];

const TEST_PITCH_WEAK: PitchData = {
  companyName: "Synapse AI",
  oneLineDescription: "AI-powered customer engagement platform that disrupts traditional CRM through machine learning and predictive analytics.",
  problem: "Companies struggle with customer engagement and retention in the modern digital landscape.",
  targetCustomer: "Mid-market enterprises looking to optimize their customer journey.",
  sector: "B2B SaaS",
  stage: "pre-revenue",
  teamSize: "2 co-founders",
  founderBackground: "Two technical founders passionate about AI and customer experience.",
  traction: "We're in stealth mode and have strong early interest from prospective customers.",
  ask: "Looking to raise around £1M to £2M for our seed round.",
  rawText: "Buzzword-heavy pre-revenue pitch with no specifics.",
};

const TEST_CONVERSATION_WEAK: PitchMessage[] = [
  { role: "ai", text: "Right, let's start with the problem. Walk me through who specifically feels this pain at Synapse AI, and what they do today instead of using your solution.", questionNumber: 1 },
  { role: "user", text: "We're solving the problem of customer engagement in the digital age. Companies are struggling to keep up with customer expectations and we're providing an AI-powered platform to help them." },
  { role: "ai", text: "Picture a specific person. What's their job title, what's their day like, when do they actually hit this problem?", questionNumber: 1 },
  { role: "user", text: "Yeah so it would be like a Head of Customer Experience or a CX Director at a mid-market company. They have a lot of data but they can't make sense of it, and our platform helps them with that." },
  { role: "ai", text: "OK, why now and why you. What's changed recently that makes this possible, and what about your background means you should be the one building it?", questionNumber: 2 },
  { role: "user", text: "AI has obviously changed everything in the last year or two. We're both technical founders with a passion for this space and we believe we can build the best product." },
  { role: "ai", text: "Got it. Let me ask about the product and traction. What's actually built and shipping today, and what real customer evidence do you have?", questionNumber: 3 },
  { role: "user", text: "We have an MVP and we're in stealth mode. We've had strong early interest from a number of prospective customers but we're not ready to share details yet." },
  { role: "ai", text: "Right, the market. Forget the global TAM. In the UK alone, how many specific organisations could realistically buy this, and where do you find them?", questionNumber: 4 },
  { role: "user", text: "The market is huge. There are thousands of mid-market companies in the UK that could benefit from our solution. The TAM is something like £5 billion globally." },
  { role: "ai", text: "Helpful. The business model. If I bought one customer for you, how much do they make you in their first year, and how much did it cost to find them?", questionNumber: 5 },
  { role: "user", text: "We haven't fully figured out our pricing yet but we're thinking enterprise SaaS pricing, probably £30k to £50k a year per customer. CAC we'll figure out post-launch." },
  { role: "ai", text: "Got it. Last one. What are you raising and what does the next 18 months look like?", questionNumber: 6 },
  { role: "user", text: "We're looking to raise around £1M to £2M for our seed round. We'll use it to build out the team, scale our marketing, and acquire customers." },
  { role: "ai", text: "Right, that's everything I need. I'm going to put together my notes for you now.", questionNumber: 6 },
];

export default function PitchPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("welcome");
  const [pitchData, setPitchData] = useState<PitchData | null>(null);
  const [testMode, setTestMode] = useState(false);

  useEffect(function () {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("test") === "true") {
        setTestMode(true);
      }
    }
  }, []);

  function loadTestPreset(preset: "tilly" | "weak") {
    const data = preset === "tilly" ? TEST_PITCH_TILLY : TEST_PITCH_WEAK;
    const conversation = preset === "tilly" ? TEST_CONVERSATION_TILLY : TEST_CONVERSATION_WEAK;

    sessionStorage.setItem("pitchperfect_data", JSON.stringify(data));
    sessionStorage.setItem("pitchperfect_conversation", JSON.stringify(conversation));
    sessionStorage.setItem("pitchperfect_started_at", new Date().toISOString());
    sessionStorage.setItem("pitchperfect_finished_at", new Date().toISOString());
    sessionStorage.removeItem("pitchperfect_critique");
    sessionStorage.removeItem("pitchperfect_generated_at");

    router.push("/pitch/results");
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 px-6 py-12">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <div className="text-sm font-semibold text-purple-600 mb-3 tracking-widest uppercase">
            Pitch Perfect
          </div>
          {stage === "welcome" && (
            <>
              <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4 tracking-tight leading-tight">
                Pitch your business to an AI investor.
              </h1>
              <p className="text-lg text-slate-600 mb-2 max-w-xl mx-auto">
                Upload your one-pager, have a friendly conversation about your seed-stage business, then get an honest written breakdown.
              </p>
              <p className="text-xs text-slate-400 mb-10">
                We use your pitch only for this session. No account needed.
              </p>
            </>
          )}
        </div>

        {testMode && stage === "welcome" && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-6 mb-8 max-w-2xl mx-auto">
            <div className="text-xs font-semibold uppercase tracking-wider text-amber-800 mb-3">
              Test mode (only visible with ?test=true)
            </div>
            <p className="text-sm text-amber-900 mb-4">
              Skip the conversation and go straight to results with pre-baked test data. Used for iterating on the results prompt.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => loadTestPreset("tilly")}
                className="px-5 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium text-sm"
              >
                Use Tilly (realistic mid-tier pitch)
              </button>
              <button
                onClick={() => loadTestPreset("weak")}
                className="px-5 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium text-sm"
              >
                Use Synapse AI (buzzword-heavy weak pitch)
              </button>
            </div>
          </div>
        )}

        {stage === "welcome" && (
          <PitchUpload
            onExtracted={(data) => {
              setPitchData(data);
              setStage("confirm");
            }}
          />
        )}

        {stage === "confirm" && pitchData && (
          <PitchConfirm
            data={pitchData}
            onConfirm={(finalData) => {
              sessionStorage.setItem("pitchperfect_data", JSON.stringify(finalData));
              router.push("/pitch/conversation");
            }}
            onBack={() => {
              setPitchData(null);
              setStage("welcome");
            }}
          />
        )}

        <div className="text-center mt-12">
          <button
            onClick={() => router.push("/")}
            className="text-sm text-slate-400 hover:text-slate-600 underline"
          >
            Back to home
          </button>
        </div>
      </div>
    </main>
  );
}
