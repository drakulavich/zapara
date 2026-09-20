export type EventKind = "prompt" | "report" | "output" | "interrupt" | "reject" | "answer" | "question" | "plan_review" | "mode_change" | "activity";
export type Event = { ts: number; sessionId: string; kind: EventKind; tokens?: number };
export type Transcript = { path: string; text: string };
export type Window = { to: string; days: number; now?: Date }; // to = "YYYY-MM-DD" local
export type Metrics = {
  sessions: number; prompts: number; reports: number; outputTokens: number; interrupts: number; rejects: number; questions: number;
  plans: number; modeSwitches: number; decisions: number; contextSwitches: number;
  activeMin: number; streakMin: number; lateNight: boolean;
};
export type Level = "Calm" | "Warming" | "Heating" | "Fried";
export type Parts = { parallel: number; pace: number; supervision: number; reading: number; streak: number; late: number }; // weighted points, sum ≈ index
export type Score = { index: number; level: Level; parts: Parts };
export type HourBucket = Metrics & { hour: number; score: Score | null };
export type Totals = { prompts: number; reports: number; outputTokens: number; interrupts: number; rejects: number; questions: number; plans: number; modeSwitches: number; decisions: number; contextSwitches: number; maxSessions: number };
// asOf is set only on the day that is still open when the report runs (the day
// containing `now`), ISO 8601 UTC.
// `presence` is the day's last human action and the start of the streak that
// action belongs to, both ISO 8601 UTC. The start may lie on an earlier day or
// in the look-back. `null` on a day with no human action. It is what lets a
// reader measure the streak against its own clock instead of the hour bucket.
export type Day = { date: string; peak: number | null; mean: number | null; activeMin: number; presence: { lastAt: string; streakStartAt: string } | null; totals: Totals; buckets: HourBucket[]; asOf?: string };
