export type EventKind = "prompt" | "interrupt" | "reject" | "question" | "plan_review" | "mode_change" | "activity";
export type Event = { ts: number; sessionId: string; kind: EventKind };
export type Transcript = { path: string; text: string };
export type Window = { to: string; days: number };            // to = "YYYY-MM-DD" local
export type Metrics = {
  sessions: number; prompts: number; interrupts: number; rejects: number; questions: number;
  plans: number; modeSwitches: number; decisions: number; contextSwitches: number;
  activeMin: number; streakMin: number; lateNight: boolean;
};
export type Level = "Calm" | "Warming" | "Heating" | "Fried";
export type Parts = { parallel: number; pace: number; decisions: number; streak: number; late: number }; // weighted points, sum ≈ index
export type Score = { index: number; level: Level; parts: Parts };
export type HourBucket = Metrics & { hour: number; score: Score | null };
export type Totals = { prompts: number; interrupts: number; rejects: number; questions: number; plans: number; modeSwitches: number; decisions: number; contextSwitches: number; maxSessions: number };
export type Day = { date: string; peak: number | null; mean: number | null; activeMin: number; totals: Totals; buckets: HourBucket[] };
