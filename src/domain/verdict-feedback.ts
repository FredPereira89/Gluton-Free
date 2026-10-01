export const VERDICT_FEEDBACK_JUDGEMENTS = ["too_high", "about_right", "too_low"] as const;
export type VerdictFeedbackJudgement = (typeof VERDICT_FEEDBACK_JUDGEMENTS)[number];

export const VERDICT_FEEDBACK_LABELS: Record<VerdictFeedbackJudgement, string> = {
  too_high: "Too high",
  about_right: "About right",
  too_low: "Too low",
};
