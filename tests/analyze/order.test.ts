import { describe, expect, test } from "bun:test";
import { analyze } from "../../src/analyze.ts";
import { assistant, prompt, transcript } from "../helpers/transcript.ts";

const sid = (n: number) => `${n}${n}${n}${n}${n}${n}${n}${n}-1111-4111-8111-111111111111`;
const W = { to: "2026-09-14", days: 1 };

describe("order independence", () => {
  const files = [1, 2, 3].map((n) => transcript(
    [prompt(`2026-09-14T13:0${n}:00.000Z`, sid(n)), assistant(`2026-09-14T13:1${n}:00.000Z`, sid(n)), prompt(`2026-09-14T13:2${n}:00.000Z`, sid(n))],
    `p/${n}.jsonl`,
  ));

  test("the same transcripts in any order give the same report", () => {
    const a = analyze(files, W);
    const b = analyze([files[2]!, files[0]!, files[1]!], W);
    const c = analyze([files[1]!, files[2]!, files[0]!], W);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    expect(a[0]!.buckets[13]!.contextSwitches).toBe(5);
  });

  test("events out of chronological order inside one file are sorted", () => {
    const shuffled = transcript([prompt("2026-09-14T13:20:00.000Z", sid(1)), prompt("2026-09-14T13:00:00.000Z", sid(1)), assistant("2026-09-14T13:09:00.000Z", sid(1))]);
    const b = analyze([shuffled], W)[0]!.buckets[13]!;
    // sorted: 13:00, 13:09 (gap 9, continues), 13:20 (gap 11 > GAP_MS, breaks).
    // The last activity's own streak starts at 13:20, so its length is 0.
    expect(b.streakMin).toBe(0);
  });
});
