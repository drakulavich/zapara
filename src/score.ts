import type { Level, Metrics, Parts, Score } from "./types.ts";

// Calibration lives here and nowhere else. A change is one diff plus a CHANGELOG line.
// points of 100; equivalent to 0.30/0.20/0.20/0.15/0.15 in the spec, kept as integers so 0.5 sums stay exact
export const WEIGHTS = { parallel: 30, pace: 20, decisions: 20, streak: 15, late: 15 } as const;
export const NORMS = { parallelSpan: 4, pacePerHour: 40, decisionsPerHour: 20, streakMin: 120 } as const;
export const LEVELS: readonly { max: number; level: Level }[] = [
  { max: 29, level: "Calm" },
  { max: 59, level: "Warming" },
  { max: 84, level: "Heating" },
  { max: 100, level: "Fried" },
];

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

export function levelOf(index: number): Level {
  for (const l of LEVELS) if (index <= l.max) return l.level;
  return "Fried";
}

export function score(m: Metrics): Score | null {
  if (m.sessions === 0) return null;
  const parallel = clamp01((m.sessions - 1) / NORMS.parallelSpan);
  const pace = clamp01(m.prompts / NORMS.pacePerHour);
  const decisions = clamp01(m.decisions / NORMS.decisionsPerHour);
  const streak = clamp01(m.streakMin / NORMS.streakMin);
  const late = m.lateNight ? 1 : 0;

  const raw = {
    parallel: WEIGHTS.parallel * parallel,
    pace: WEIGHTS.pace * pace,
    decisions: WEIGHTS.decisions * decisions,
    streak: WEIGHTS.streak * streak,
    late: WEIGHTS.late * late,
  };
  // parts are the same raw weighted points, rounded to one decimal for display only.
  const parts: Parts = {
    parallel: Math.round(raw.parallel * 10) / 10,
    pace: Math.round(raw.pace * 10) / 10,
    decisions: Math.round(raw.decisions * 10) / 10,
    streak: Math.round(raw.streak * 10) / 10,
    late: Math.round(raw.late * 10) / 10,
  };
  // index is rounded once, from the unrounded raw points, so per-component
  // rounding (parts, above) can never tip it across a boundary raw didn't.
  const index = Math.round(raw.parallel + raw.pace + raw.decisions + raw.streak + raw.late);
  return { index, level: levelOf(index), parts };
}
