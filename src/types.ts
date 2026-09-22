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
// A bucket's metrics, scored: the twenty-four hour buckets and the live one share it.
export type LiveBucket = Metrics & { score: Score | null };
export type HourBucket = LiveBucket & { hour: number };
export type Totals = { prompts: number; reports: number; outputTokens: number; interrupts: number; rejects: number; questions: number; plans: number; modeSwitches: number; decisions: number; contextSwitches: number; maxSessions: number };
// asOf is set only on the day that is still open when the report runs (the day
// containing `now`), ISO 8601 UTC.
// `live` is set exactly when `asOf` is: the sixty minutes ending at `asOf`,
// `(asOf − 60 min, asOf]`, measured by the rule an hour bucket uses, so a
// status line reads a number that does not reset on the hour. The look-back
// applies: at 00:20 the window reaches into yesterday.
// `presence` is the day's last human action and the start of the streak that
// action belongs to, both ISO 8601 UTC. The start may lie on an earlier day or
// in the look-back. `null` on a day with no human action. It is what lets a
// reader measure the streak against its own clock instead of the hour bucket.
export type Day = { date: string; peak: number | null; mean: number | null; activeMin: number; presence: { lastAt: string; streakStartAt: string } | null; totals: Totals; buckets: HourBucket[]; asOf?: string; live?: LiveBucket };
