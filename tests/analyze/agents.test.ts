import { describe, expect, test } from "bun:test";
import { analyze } from "../../src/analyze.ts";
import { assistantText, assistantToolUseOnly, crossSession, prompt, taskNotification, teammate, transcript } from "../helpers/transcript.ts";

const S = "11111111-1111-4111-8111-111111111111";
const W = { to: "2026-09-14", days: 1 };
const at = (hhmm: string) => `2026-09-14T${hhmm}:00.000Z`;

describe("inbound agent messages are reports, never prompts", () => {
  const t = transcript([
    teammate(at("13:00"), S),
    crossSession(at("13:01"), S),
    taskNotification(at("13:02"), S),
    prompt(at("13:03"), S),
  ]);
  const day = analyze([t], W)[0]!;
  const b = day.buckets[13]!;

  test("three reports and one prompt", () => {
    expect(b.reports).toBe(3);
    expect(b.prompts).toBe(1);
  });

  test("reports are activity: one session, all four records in the same 5-minute slot", () => {
    expect(b.sessions).toBe(1);
    expect(b.activeMin).toBe(5);
  });
});

describe("every marker form is a report and never a prompt", () => {
  const variants: [string, string][] = [
    ["Another Claude session sent a message: lead-in", teammate(at("13:00"), S)],
    ["bare <teammate-message", teammate(at("13:00"), S, true)],
    ["<cross-session-message", crossSession(at("13:00"), S)],
    ["[Cross-session bracket form", crossSession(at("13:00"), S, true)],
    ["<task-notification>", taskNotification(at("13:00"), S)],
  ];

  for (const [name, line] of variants) {
    test(`${name} counts as one report and zero prompts`, () => {
      const day = analyze([transcript([line])], W)[0]!;
      const b = day.buckets[13]!;
      expect(b.reports).toBe(1);
      expect(b.prompts).toBe(0);
    });
  }
});

describe("output tokens are summed once per requestId per file", () => {
  test("three records repeating the same requestId count its tokens once", () => {
    const t = transcript([
      assistantText(at("13:00"), S, 250, "req_1"),
      assistantText(at("13:00"), S, 250, "req_1"),
      assistantText(at("13:00"), S, 250, "req_1"),
    ]);
    const day = analyze([t], W)[0]!;
    expect(day.buckets[13]!.outputTokens).toBe(250);
  });

  test("a response holding only a tool_use block contributes no tokens", () => {
    const t = transcript([assistantToolUseOnly(at("13:00"), S, 500, "req_2")]);
    const day = analyze([t], W)[0]!;
    expect(day.buckets[13]!.outputTokens).toBe(0);
  });

  test("distinct requestIds each contribute their own tokens", () => {
    const t = transcript([
      assistantText(at("13:00"), S, 100, "req_a"),
      assistantText(at("13:01"), S, 200, "req_b"),
    ]);
    const day = analyze([t], W)[0]!;
    expect(day.buckets[13]!.outputTokens).toBe(300);
  });

  test("a tool-use-only record does not block a later text record of the same requestId", () => {
    // The first record of req_mixed has no text block and must not emit; the
    // dedupe set must therefore stay empty for req_mixed until the second
    // record (which does have a text block) emits and marks it seen.
    const t = transcript([
      assistantToolUseOnly(at("13:00"), S, 300, "req_mixed"),
      assistantText(at("13:00"), S, 300, "req_mixed"),
    ]);
    const day = analyze([t], W)[0]!;
    expect(day.buckets[13]!.outputTokens).toBe(300);
  });
});

describe("day totals sum reports and outputTokens across the day's buckets", () => {
  const t = transcript([
    teammate(at("13:00"), S),
    assistantText(at("13:01"), S, 100, "req_x"),
    teammate(at("14:00"), S),
    teammate(at("14:01"), S),
    assistantText(at("14:02"), S, 200, "req_y"),
  ]);
  const day = analyze([t], W)[0]!;

  test("per-hour buckets", () => {
    expect(day.buckets[13]!.reports).toBe(1);
    expect(day.buckets[13]!.outputTokens).toBe(100);
    expect(day.buckets[14]!.reports).toBe(2);
    expect(day.buckets[14]!.outputTokens).toBe(200);
  });

  test("day totals", () => {
    expect(day.totals.reports).toBe(3);
    expect(day.totals.outputTokens).toBe(300);
  });
});

describe("reports and output tokens are measured but do not enter the index", () => {
  // Same session, same single timestamp for every event, so sessions, prompts,
  // decisions, activeMin and streakMin are identical between the two buckets;
  // the only difference is 20 extra report events. If reports (or the activity
  // they add) ever leaked into the score, the indexes and parts would diverge.
  const lonely = analyze([transcript([prompt(at("13:00"), S)])], W)[0]!.buckets[13]!;
  const busy = analyze(
    [transcript([prompt(at("13:00"), S), ...Array.from({ length: 20 }, () => teammate(at("13:00"), S))])],
    W,
  )[0]!.buckets[13]!;

  test("reports differ but the index and its parts do not", () => {
    expect(lonely.reports).toBe(0);
    expect(busy.reports).toBe(20);
    expect(busy.score?.index).toBe(lonely.score?.index);
    expect(busy.score?.parts).toEqual(lonely.score?.parts);
  });
});
