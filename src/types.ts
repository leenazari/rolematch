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

export type ExtractCVResponse = {
  ok: boolean;
  data?: CVData;
  error?: string;
};

export type Message = {
  role: "ai" | "user";
  text: string;
  questionNumber?: number;
};

export type ConversationState = {
  messages: Message[];
  currentQuestion: number;
  followUpsThisQuestion: number;
  finished: boolean;
  coachingUsed: boolean;
};

export type NextQuestionResponse = {
  ok: boolean;
  text?: string;
  questionNumber?: number;
  followUpsThisQuestion?: number;
  finished?: boolean;
  coachingUsed?: boolean;
  error?: string;
};

export type SalaryTiers = {
  entry: string;
  established: string;
  senior: string;
  startingTier: "entry" | "established" | "senior";
};

export type RoleMatch = {
  title: string;
  category: "strong" | "stretch" | "pivot";
  consultantParagraph: string;
  whyUnexpected?: string;
  yourStrengths: string[];
  developmentGaps: string[];
  nextStep: string;
  salary: SalaryTiers;
};

export type ResultsData = {
  summary: string;
  roles: RoleMatch[];
};

export type GenerateResultsResponse = {
  ok: boolean;
  data?: ResultsData;
  error?: string;
};
