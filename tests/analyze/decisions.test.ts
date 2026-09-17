import { describe, expect, test } from "bun:test";
import { analyze } from "../../src/analyze.ts";
import { assistant, interrupt, mode, plan, prompt, question, reject, toolResult, transcript } from "../helpers/transcript.ts";

const S = "11111111-1111-4111-8111-111111111111";
const W = { to: "2026-09-14", days: 1 };
const at = (hhmm: string) => `2026-09-14T${hhmm}:00.000Z`;

describe("decisions in one hour", () => {
  const t = transcript([
    mode(S, "auto"),                 // baseline, not a switch
    prompt(at("13:00"), S),
    assistant(at("13:01"), S),
    interrupt(at("13:02"), S),
    interrupt(at("13:03"), S, true),
    reject(at("13:04"), S),
    toolResult(at("13:05"), S),     // ordinary tool result: not a prompt, not a reject
    question(at("13:06"), S),
    plan(at("13:07"), S),
    mode(S, "plan"),                 // switch 1 (ts of the plan record, 13:07)
    mode(S, "plan"),                 // repeat, nothing
    mode(S, "acceptEdits"),          // switch 2
    prompt(at("13:08"), S),
  ]);
  const day = analyze([t], W)[0]!;
  const b = day.buckets[13]!;

  test("counts each decision kind once", () => {
    expect(b.prompts).toBe(2);
    expect(b.interrupts).toBe(2);
    expect(b.rejects).toBe(1);
    expect(b.questions).toBe(1);
    expect(b.plans).toBe(1);
    expect(b.modeSwitches).toBe(2);
    expect(b.decisions).toBe(7);
  });

  test("interrupts are not prompts and tool results are neither", () => {
    expect(b.prompts).toBe(2);
  });

  test("a mode record before any timestamp is dropped", () => {
    const d = analyze([transcript([mode(S, "auto"), mode(S, "plan"), prompt(at("14:00"), S)])], W)[0]!;
    expect(d.buckets[14]!.modeSwitches).toBe(0);
  });

  test("day totals sum the buckets", () => {
    expect(day.totals.decisions).toBe(7);
    expect(day.totals.prompts).toBe(2);
    expect(day.totals.maxSessions).toBe(1);
  });

  test("the score is attached and the index follows the formula", () => {
    // sessions 1, prompts 2, decisions 7, reports 0, context switches 0 (both
    // prompts are the same session), output tokens 100 (one assistant reply),
    // streak 8 min (13:00 to 13:08), hour 13 is not late:
    // parallel 0 + pace 15*(2/20) = 1.5 + supervision 30*(3*7 + 0 + 0)/45 = 14
    // + reading 10*(100/80000) = 0.0125 + streak 10*(8/120) = 0.6667 + late 0
    // = 16.179 -> 16
    expect(b.score?.index).toBe(16);
    expect(day.peak).toBe(16);
  });
});
