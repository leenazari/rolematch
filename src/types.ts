export type CVData = {
  name: string;
  currentRole: string;
  sector: string;
  yearsExperience: number;
  keySkills: string[];
  education: string;
  notableEmployers: string[];
  rawText: string;
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
};

export type NextQuestionResponse = {
  ok: boolean;
  text?: string;
  questionNumber?: number;
  followUpsThisQuestion?: number;
  finished?: boolean;
  error?: string;
};
