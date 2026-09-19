import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { cardData, sentenceText } from "../../src/card.ts";
import { report } from "../../src/report.ts";

// The 7-day fixture seen through the card's default 14-day window ending on the
// fixture's Sunday: 22 active hours (15 Calm, 3 Warming, 1 Heating, 3 Fried).
const projects = join(import.meta.dir, "../fixtures/busy-week/projects");
const days = await report({ projects, to: "2026-09-20", days: 14 });
const card = cardData(days, { days: 14 })!;

describe("busy-week card", () => {
  test("the long calm days make it the Marathoner", () => {
    // Shares: conductor 0.31, supervisor 0.19, marathoner 0.80, night owl 0.14 (3 of 22 hours are late).
    expect(card.character).toBe("marathoner");
    expect(card.name).toBe("The Marathoner");
    expect(card.motto).toBe("You do not stop while it compiles.");
  });

  test("the sentence carries the longest streak and the calm share, in bold", () => {
    // Tuesday's calm 10-18 run of prompts reaches 473 min at hour 17 (10:00 to
    // 17:53) -> 7h53m; 15 of 22 hours are Calm -> 68%.
    expect(sentenceText(card.sentence)).toBe("Longest streak 7h53m without a break, 68% of your hours calm.");
    expect(card.sentence.filter((s) => s.strong).map((s) => s.text)).toEqual(["7h53m", "68%"]);
  });

  test("shares are the fraction of each character's maximum points", () => {
    expect(card.shares.conductor).toBeCloseTo(0.311, 2);
    expect(card.shares.supervisor).toBeCloseTo(0.195, 2);
    // Streak points total 175.7 of a possible 220. Every hour that was already
    // past the 120-minute cap still is, so the 2.4 points lost are the four
    // opening hours of a run: a run now ends on its last prompt rather than on
    // the reply three minutes later, which costs each of them 3 minutes
    // (53 -> 50 and 113 -> 110, a tenth of a point each way).
    expect(card.shares.marathoner).toBeCloseTo(0.799, 2);
    expect(card.shares.nightOwl).toBeCloseTo(0.136, 2);
  });

  test("peak is Monday's storm", () => {
    expect(card.peak).toEqual({ index: 87, level: "Fried" });
  });

  test("spectrum: 15 / 3 / 1 / 3 of 22 hours -> 68 / 14 / 4 / 14, summing to 100", () => {
    // Floors 68/13/4/13 = 98; warming and fried share the largest remainder (.64) and both round up.
    expect(card.spectrum).toEqual({ calm: 68, warming: 14, heating: 4, fried: 14 });
    expect(Object.values(card.spectrum).reduce((a, b) => a + b, 0)).toBe(100);
  });

  test("highlights: the owned pair, then the largest remaining norm", () => {
    // Remaining norms: contextSwitches 54/45 = 1.2 beats peakSessions (5-1)/4 = 1.0,
    // tokensRead 232600/(65000*22) = 0.16 and reportsRead 0; lateShare is not eligible here.
    expect(card.highlights).toEqual([
      { key: "longestStreak", value: "7h53m", caption: "longest streak" },
      { key: "interrupts", value: "80", caption: "times you stopped Claude" },
      { key: "contextSwitches", value: "54", caption: "switches in one hour" },
    ]);
  });

  test("days is the window's", () => {
    expect(card.days).toBe(14);
  });
});
