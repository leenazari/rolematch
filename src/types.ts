export type CVData = {
  name: string;
  currentRole: string;
  sector: string;
  yearsExperience: number;
  keySkills: string[];
  education: string;
  notableEmployers: string[];
  rawText: string;
  lovedSkills: string[];
  avoidSkills: string[];
};

export type Message = {
  role: "ai" | "user";
  text: string;
  questionNumber?: number;
  isGoldenThreadProbe?: boolean;
};

export type RoleMatch = {
  title: string;
  category: "recommended" | "consider";
  matchScore: number;
  consultantParagraph: string;
  whyUnexpected?: string;
  yourStrengths: string[];
  developmentGaps: string[];
  nextStep: string;
  salary: {
    entry: string;
    established: string;
    senior: string;
    startingTier: "entry" | "established" | "senior";
  };
};

export type ResultsData = {
  summary: string;
  roles: RoleMatch[];
};

export type NextQuestionResponse = {
  ok: boolean;
  text?: string;
  questionNumber?: number;
  followUpsThisQuestion?: number;
  finished?: boolean;
  coachingUsed?: boolean;
  isGoldenThreadProbe?: boolean;
  error?: string;
};

export type PitchData = {
  companyName: string;
  oneLineDescription: string;
  problem: string;
  targetCustomer: string;
  sector: string;
  stage: string;
  teamSize: string;
  founderBackground: string;
  traction: string;
  ask: string;
  rawText: string;
};

export type PitchMessage = {
  role: "ai" | "user";
  text: string;
  questionNumber?: number;
  isFollowUpProbe?: boolean;
};

export type PitchCritique = {
  verdict: string;
  strong: string[];
  weak: string[];
  fatalFlaw: string | null;
  sectorConcerns: string[];
  revisedPitch: string;
  thirtyDayActions: string[];
  vcQuestions: { question: string; prepGuidance: string }[];
};
