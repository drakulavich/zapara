import { describe, expect, test } from "bun:test";
import { analyze } from "../../src/analyze.ts";
import { assistant, prompt, transcript } from "../helpers/transcript.ts";

const A = "aaaaaaaa-1111-4111-8111-111111111111";
const B = "bbbbbbbb-1111-4111-8111-111111111111";
const W = { to: "2026-09-14", days: 1 };

describe("streak and active minutes", () => {
  test("a 9-minute gap continues the streak, an 11-minute gap breaks it", () => {
    const d = analyze([transcript([
      prompt("2026-09-14T10:00:00.000Z", A),
      assistant("2026-09-14T10:09:00.000Z", A),   // gap 9 → streak 9
      prompt("2026-09-14T10:20:00.000Z", A),      // gap 11 → new streak
      assistant("2026-09-14T10:25:00.000Z", A),   // streak 5
    ])], W)[0]!;
    expect(d.buckets[10]!.streakMin).toBe(5);
  });

  test("a gap of exactly 10 minutes continues the streak", () => {
    const d = analyze([transcript([
      prompt("2026-09-14T10:00:00.000Z", A),
      assistant("2026-09-14T10:10:00.000Z", A),   // gap 10, not > GAP_MS, continues
      prompt("2026-09-14T10:20:00.000Z", A),      // gap 10, continues
    ])], W)[0]!;
    expect(d.buckets[10]!.streakMin).toBe(20);
  });

  test("the streak crosses sessions", () => {
    const d = analyze([
      transcript([prompt("2026-09-14T10:00:00.000Z", A), prompt("2026-09-14T10:08:00.000Z", A)], "p/a.jsonl"),
      transcript([prompt("2026-09-14T10:16:00.000Z", B), prompt("2026-09-14T10:24:00.000Z", B)], "p/b.jsonl"),
    ], W)[0]!;
    expect(d.buckets[10]!.streakMin).toBe(24);
  });

  test("the streak carries across the hour boundary", () => {
    const lines = [];
    for (let m = 0; m < 120; m += 5) lines.push(prompt(new Date(Date.UTC(2026, 8, 14, 10, m)).toISOString(), A));
    const d = analyze([transcript(lines)], W)[0]!;
    expect(d.buckets[10]!.streakMin).toBe(55);
    expect(d.buckets[11]!.streakMin).toBe(115);
    expect(d.buckets[11]!.score!.parts.streak).toBe(9.6); // 10 * 115/120 = 9.5833... -> 9.6
  });

  test("a streak that started in the look-back before the window is measured, but not bucketed", () => {
    const lines = [];
    // 22:00 on the 13th to 00:30 on the 14th, every 5 minutes
    for (let m = 0; m <= 150; m += 5) lines.push(prompt(new Date(Date.UTC(2026, 8, 13, 22, m)).toISOString(), A));
    const d = analyze([transcript(lines)], W)[0]!;
    expect(d.date).toBe("2026-09-14");
    expect(d.buckets[0]!.prompts).toBe(7);        // 00:00 .. 00:30
    expect(d.buckets[0]!.streakMin).toBe(150);    // since 22:00 the day before
    expect(d.totals.prompts).toBe(7);
  });

  test("activity before the 3-hour look-back is ignored entirely", () => {
    const d = analyze([transcript([
      prompt("2026-09-13T20:00:00.000Z", A),   // 4h before the window: dropped
      prompt("2026-09-13T20:05:00.000Z", A),
      prompt("2026-09-14T00:02:00.000Z", A),
    ])], W)[0]!;
    expect(d.buckets[0]!.streakMin).toBe(0);
  });

  test("active minutes count 5-minute slots, not events", () => {
    const d = analyze([transcript([
      prompt("2026-09-14T10:00:00.000Z", A),
      assistant("2026-09-14T10:01:00.000Z", A),
      assistant("2026-09-14T10:04:59.000Z", A),
      prompt("2026-09-14T10:05:00.000Z", A),
      prompt("2026-09-14T10:40:00.000Z", B),
    ])], W)[0]!;
    expect(d.buckets[10]!.activeMin).toBe(15);
    expect(d.activeMin).toBe(15);
  });
});
