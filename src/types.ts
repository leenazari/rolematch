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
