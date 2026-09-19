import { describe, expect, test } from "bun:test";
import { analyze } from "../../src/analyze.ts";
import { renderStatus, statusOf } from "../../src/status.ts";
import { assistant, prompt, transcript } from "../helpers/transcript.ts";

const S = [
  "aaaaaaaa-1111-4111-8111-111111111111",
  "bbbbbbbb-2222-4222-8222-222222222222",
  "cccccccc-3333-4333-8333-333333333333",
];
// Two active hours on 14 Sept (UTC, and TZ=UTC in tests). 13:00 is the busy one:
// twelve prompts round-robin across three sessions. 14:00 is a single quiet
// exchange, so the current hour's numbers differ from the day's peak.
const busy = Array.from({ length: 12 }, (_, i) => {
  const mm = String(i * 4).padStart(2, "0");
  const sid = S[i % 3]!;
  return [prompt(`2026-09-14T13:${mm}:00.000Z`, sid), assistant(`2026-09-14T13:${mm}:30.000Z`, sid)];
}).flat();
const t = transcript([
  ...busy,
  prompt("2026-09-14T14:10:00.000Z", S[0]!), assistant("2026-09-14T14:12:00.000Z", S[0]!),
]);

describe("status: today's load in nine fields", () => {
  test("the current hour's bucket and the day's peak and active time", () => {
    const now = new Date("2026-09-14T14:32:00.000Z");
    const [day] = analyze([t], { to: "2026-09-14", days: 1, now });
    const current = day!.buckets[14]!, busiest = day!.buckets[13]!;
    const s = statusOf(day!, now);
    expect(s).toEqual({
      schema: 1, asOf: "2026-09-14T14:32:00.000Z", date: "2026-09-14", hour: 14,
      index: current.score!.index, level: current.score!.level,
      peak: day!.peak, activeMin: day!.activeMin, streakMin: current.streakMin,
    });
    // The busier hour is behind us: the status describes now, the peak the day.
    expect(s.peak).toBe(busiest.score!.index);
    expect(s.index!).toBeLessThan(s.peak!);
    expect(s.streakMin).toBeLessThan(busiest.streakMin);
    expect(s.peak).not.toBe(day!.mean);
  });
  test("an hour with no activity yet is null for index and level, the day's numbers stay", () => {
    const now = new Date("2026-09-14T16:05:00.000Z");
    const [day] = analyze([t], { to: "2026-09-14", days: 1, now });
    const s = statusOf(day!, now);
    expect([s.hour, s.index, s.level, s.streakMin]).toEqual([16, null, null, 0]);
    expect([s.peak, s.activeMin]).toEqual([day!.peak, day!.activeMin]);
  });
  test("a day with no activity is all null and zero, and still has its date and time", () => {
    const now = new Date("2026-09-14T09:15:00.000Z");
    const [day] = analyze([], { to: "2026-09-14", days: 1, now });
    expect(statusOf(day!, now)).toEqual({ schema: 1, asOf: "2026-09-14T09:15:00.000Z", date: "2026-09-14", hour: 9, index: null, level: null, peak: null, activeMin: 0, streakMin: 0 });
  });
  test("renderStatus is one line in the spec's field order with a newline", () => {
    const now = new Date("2026-09-14T09:15:00.000Z");
    const [day] = analyze([], { to: "2026-09-14", days: 1, now });
    expect(renderStatus(statusOf(day!, now))).toBe('{"schema":1,"asOf":"2026-09-14T09:15:00.000Z","date":"2026-09-14","hour":9,"index":null,"level":null,"peak":null,"activeMin":0,"streakMin":0}\n');
  });
});
