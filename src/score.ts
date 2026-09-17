import type { Level, Metrics, Parts, Score } from "./types.ts";

// Calibration lives here and nowhere else. A change is one diff plus a CHANGELOG line.
export const WEIGHTS = { parallel: 0.3, pace: 0.2, decisions: 0.2, streak: 0.15, late: 0.15 } as const;
export const NORMS = { parallelSpan: 4, pacePerHour: 40, decisionsPerHour: 20, streakMin: 120 } as const;
export const LEVELS: readonly { max: number; level: Level }[] = [
  { max: 29, level: "Calm" },
  { max: 59, level: "Warming" },
  { max: 84, level: "Heating" },
  { max: 100, level: "Fried" },
];

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const points = (weight: number, component: number): number => Math.round(1000 * weight * component) / 10;

export function levelOf(index: number): Level {
  for (const l of LEVELS) if (index <= l.max) return l.level;
  return "Fried";
}

export function score(m: Metrics): Score | null {
  if (m.sessions === 0) return null;
  const parts: Parts = {
    parallel: points(WEIGHTS.parallel, clamp01((m.sessions - 1) / NORMS.parallelSpan)),
    pace: points(WEIGHTS.pace, clamp01(m.prompts / NORMS.pacePerHour)),
    decisions: points(WEIGHTS.decisions, clamp01(m.decisions / NORMS.decisionsPerHour)),
    streak: points(WEIGHTS.streak, clamp01(m.streakMin / NORMS.streakMin)),
    late: points(WEIGHTS.late, m.lateNight ? 1 : 0),
  };
  const index = Math.round(parts.parallel + parts.pace + parts.decisions + parts.streak + parts.late);
  return { index, level: levelOf(index), parts };
}
