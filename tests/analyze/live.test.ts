import { describe, expect, test } from "bun:test";
import { analyze } from "../../src/analyze.ts";
import { assistant, prompt, transcript } from "../helpers/transcript.ts";

const A = "aaaaaaaa-1111-4111-8111-111111111111";
const B = "bbbbbbbb-2222-4222-8222-222222222222";
const mm = (n: number) => String(n).padStart(2, "0");

// A busy hour: a prompt every five minutes from 11:05 to 11:55, alternating
// two sessions, a reply half a minute after each. Nothing before, nothing after.
const busyHour = transcript(Array.from({ length: 11 }, (_, i) => {
  const sid = i % 2 ? B : A;
  return [prompt(`2026-09-14T11:${mm(5 + i * 5)}:00.000Z`, sid), assistant(`2026-09-14T11:${mm(5 + i * 5)}:30.000Z`, sid)];
}).flat());

describe("live: the sixty minutes ending at asOf", () => {
  test("thirty seconds into the next hour the live index is still the busy hour's", () => {
    // Mutation this pins: reading buckets[now.getHours()], which is the empty hour 12.
    const now = new Date("2026-09-14T12:00:30.000Z");
    const [day] = analyze([busyHour], { to: "2026-09-14", days: 1, now });
    expect(day!.live!.score!.index).toBe(day!.buckets[11]!.score!.index);
    expect(day!.live!.score!.index).toBeGreaterThan(0);
    expect(day!.buckets[12]!.score).toBeNull();
  });

  test("only the day that carries asOf carries live; a window without a clock has none", () => {
    // Mutation this pins: attaching live to every day, or building it without `now`.
    const days = analyze([busyHour], { to: "2026-09-14", days: 2, now: new Date("2026-09-14T12:00:30.000Z") });
    expect(days.map((d) => d.live === undefined)).toEqual([true, false]);
    expect(days.map((d) => d.asOf === undefined)).toEqual([true, false]);
    const noClock = analyze([busyHour], { to: "2026-09-14", days: 2 });
    expect(noClock.every((d) => d.live === undefined)).toBe(true);
  });
});
