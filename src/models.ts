export const AVAILABLE_MODELS = [
  "gpt-4.1-nano",
  "gpt-4.1-mini",
  "gpt-4.1",
  "gpt-4o",
  "gpt-4o-mini",
  "o3-mini",
] as const;

export type ModelName = (typeof AVAILABLE_MODELS)[number];
