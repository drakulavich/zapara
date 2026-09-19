import { describe, expect, test } from "bun:test";
import { analyze } from "../../src/analyze.ts";
import { prompt, transcript } from "../helpers/transcript.ts";

const A = "a1";
describe("a window that includes today is a snapshot", () => {
  const t = transcript([prompt("2026-09-14T13:00:00.000Z", A)]);
  test("today's day carries asOf; earlier days and closed windows do not", () => {
    const days = analyze([t], { to: "2026-09-14", days: 2, now: new Date("2026-09-14T14:32:00.000Z") });
    expect(days.map((d) => d.asOf)).toEqual([undefined, "2026-09-14T14:32:00.000Z"]);
    const closed = analyze([t], { to: "2026-09-14", days: 2, now: new Date("2026-09-20T09:00:00.000Z") });
    expect(closed.every((d) => d.asOf === undefined)).toBe(true);
    const noClock = analyze([t], { to: "2026-09-14", days: 2 });
    expect(noClock.every((d) => d.asOf === undefined)).toBe(true);
  });
});
