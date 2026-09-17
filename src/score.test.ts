import { describe, expect, test } from "bun:test";
import { score, levelOf } from "./score.ts";
import type { Level, Metrics } from "./types.ts";

const base: Metrics = {
  sessions: 1, prompts: 0, interrupts: 0, rejects: 0, questions: 0, plans: 0, modeSwitches: 0,
  decisions: 0, contextSwitches: 0, activeMin: 5, streakMin: 0, lateNight: false,
};
const m = (over: Partial<Metrics>): Metrics => ({ ...base, ...over });

describe("score", () => {
  test.each<[string, Partial<Metrics>, number]>([
    ["idle single session", {}, 0],
    ["3 sessions = half of parallel weight", { sessions: 3 }, 15],
    ["5 sessions caps parallel", { sessions: 5 }, 30],
    ["9 sessions still capped", { sessions: 9 }, 30],
    ["20 prompts = half pace", { prompts: 20 }, 10],
    ["40 prompts caps pace", { prompts: 40 }, 20],
    ["10 decisions = half", { decisions: 10 }, 10],
    ["20 decisions caps", { decisions: 20 }, 20],
    ["60 min streak = half", { streakMin: 60 }, 8],
    ["120 min streak caps", { streakMin: 120 }, 15],
    ["late night alone", { lateNight: true }, 15],
    ["everything at cap", { sessions: 5, prompts: 40, decisions: 20, streakMin: 120, lateNight: true }, 100],
    ["2 min streak rounds parts to 0.3 but index to 0", { streakMin: 2 }, 0],
    // Same base as the spec's own example (sessions=5, prompts=40, decisions=20 => 70 exactly);
    // streakMin=118 rounds to 85 under both single- and double-pass rounding, so it can't tell
    // them apart. streakMin=44 does: rounding streak to one decimal first gives parts.streak=5.5
    // and a sum of exactly 75.5, which rounds up to 76; rounding the unrounded weighted sum once
    // gives 75.49999999999999 (float error from summing 0.7 + 0.055), which rounds down to 75.
    // 75 is what a single round(100 * Σ weight·component) must produce.
    ["single-pass rounding of the weighted sum, not per-part rounding, decides the index",
      { sessions: 5, prompts: 40, decisions: 20, streakMin: 44 }, 75],
  ])("%s", (_name, over, expected) => {
    expect(score(m(over))?.index).toBe(expected);
  });

  test("2 min streak still rounds its own displayed part to 0.3", () => {
    expect(score(m({ streakMin: 2 }))?.parts.streak).toBe(0.3);
  });

  test("index comes from the unrounded weighted sum, not from re-summing the rounded parts", () => {
    // 0.3*0.5 + 0.2*0.5 + 0.2*0.5 + 0.15*0.5 + 0.15*1 = 0.575 exactly on paper, but IEEE 754
    // addition lands on 0.5749999999999999, so round(100 * that) is 57, not 58. Summing the
    // already-rounded parts instead (15+10+10+7.5+15=57.5 exactly) rounds to 58: a mutation
    // that reintroduces double rounding turns this 57 back into 58.
    const s = score(m({ sessions: 3, prompts: 20, decisions: 10, streakMin: 60, lateNight: true }));
    expect(s).toEqual({
      index: 57,
      level: "Warming",
      parts: { parallel: 15, pace: 10, decisions: 10, streak: 7.5, late: 15 },
    });
  });

  test("no sessions means no score", () => {
    expect(score(m({ sessions: 0, activeMin: 0 }))).toBeNull();
  });

  test.each<[number, Level]>([[0, "Calm"], [29, "Calm"], [30, "Warming"], [59, "Warming"], [60, "Heating"], [84, "Heating"], [85, "Fried"], [100, "Fried"]])(
    "level of %i is %s", (index, level) => expect(levelOf(index)).toBe(level));

  test("level is attached to the score", () => {
    expect(score(m({ sessions: 5, prompts: 40 }))?.level).toBe("Warming"); // 50
  });
});
