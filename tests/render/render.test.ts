import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { renderDay, renderJson, renderWeek } from "../../src/render.ts";
import { report } from "../../src/report.ts";

const projects = join(import.meta.dir, "../fixtures/busy-week/projects");
const days = await report({ projects, to: "2026-09-20", days: 7 });
const monday = days[0]!;

describe("week grid", () => {
  const text = renderWeek(days, false);
  const lines = text.split("\n");

  test("header, seven rows, legend and totals", () => {
    expect(lines[0]).toBe("            00 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20 21 22 23   peak  active");
    expect(lines.slice(1, 8).map((l) => l.slice(0, 9))).toEqual(["Mon 14/09", "Tue 15/09", "Wed 16/09", "Thu 17/09", "Fri 18/09", "Sat 19/09", "Sun 20/09"]);
    expect(lines[8]).toBe("");
    expect(lines[9]).toBe("  · none  ░ calm 0-29  ▒ warming 30-59  ▓ heating 60-84  █ fried 85-100");
    // Hand-computed from the generator's day-by-day schedule (see busy-week.ts):
    // prompts 201 (Mon) + 66 (Tue) + 12 (Thu) + 55 (Fri) + 12 (Sat) = 346;
    // reports 0, since busy-week has no inbound agent-message lines;
    // decisions 75 (Mon storm) + 25 (Fri storm) = 100; active sums to 13h00;
    // max sessions is the Mon/Fri storm's 5.
    expect(lines[10]).toBe("week: active 13h00, prompts 346, reports 0, decisions 100, max sessions 5");
  });

  test("Monday reads calm morning, fried storm, quiet evening, late tail", () => {
    const row = lines[1]!;
    const cells = Array.from({ length: 24 }, (_, h) => row[12 + h * 3 + 1]);
    expect(cells.slice(0, 9).join("")).toBe("·········");
    expect(cells[9]).toBe("░");
    expect(cells[12]).toBe("█");
    expect(cells[13]).toBe("█");
    expect(cells[14]).toBe("█");
    // Storm(14, 12, 15) stops before 15:00 (see the m + 4 < 60 loop bound in
    // busy-week.ts), so hour 15 has no session at all, not a bleed-over glyph.
    expect(cells[15]).toBe("·");
    expect(cells[16]).toBe("·");
    expect(cells[23]).toBe("░");
    expect(row.slice(84)).toMatch(/^\s+\d{1,3}\s+\d+h\d{2}$/);
  });

  test("Friday's warm-up-less storm reads Heating, not Fried, and does not bleed into the next hour", () => {
    const row = lines[5]!;
    const cells = Array.from({ length: 24 }, (_, h) => row[12 + h * 3 + 1]);
    // 5 sessions, 55 prompts, 25 decisions, 55 000 output tokens, streak 56 min
    // (15:01 to 15:57, no calm warm-up before it), not a late hour:
    // parallel 25 + pace 15 + supervision 30 (3*25 = 75, already past the norm 45)
    // + reading 10*(55000/80000) = 6.875 + streak 10*(56/120) = 4.667 + late 0
    // = 81.54 -> 82, Heating (60-84). Monday's storm hours differ only in the
    // streak, which is at the cap there: 86.875 -> 87, Fried.
    expect(cells[15]).toBe("▓");
    expect(cells[16]).toBe("·");
  });

  test("an empty day shows a dot in every cell and a dash for peak", () => {
    const row = lines[3]!; // Wed
    expect(row.slice(12, 84).replace(/\s/g, "")).toBe("·".repeat(24));
    expect(row.slice(84).trim().startsWith("-")).toBe(true);
  });

  test("color mode wraps glyphs in ANSI codes and nothing else changes", () => {
    const colored = renderWeek(days, true);
    expect(colored).toContain("\x1b[31m█\x1b[0m");
    expect(colored.replace(/\x1b\[\d+m/g, "")).toBe(text);
  });
});

describe("day table", () => {
  test("one row per active hour with the raw signals", () => {
    const lines = renderDay(monday, { explain: false, color: false }).split("\n");
    expect(lines[0]).toBe("hour   index  level    sess  prompts  rep  intr  rej  quest  plan  mode  ctx-sw  streak  out-tok");
    const row13 = lines.find((l) => l.startsWith("13:00"))!;
    // 5 sessions x 11 prompt/reply pairs each (m = n, n+5, ..., <=55) = 55 prompts and
    // 55 assistant replies at 1000 output tokens apiece = 55000 -> "55.0k"; busy-week has
    // no inbound agent messages, so rep is 0 at every bucket, this one included.
    expect(row13).toMatch(/^13:00\s+\d{1,3}\s+Fried\s+5\s+55\s+0\s+\d+\s+1\s+1\s+1\s+2\s+\d+\s+\d+m\s+55\.0k$/);
    expect(lines.some((l) => l.startsWith("03:00"))).toBe(false);
  });

  test("--explain appends the six weighted parts, named and in order, and they add up to the index", () => {
    const lines = renderDay(monday, { explain: true, color: false }).split("\n");
    expect(lines[0]!.endsWith("  par  pace   sup  read  strk  late")).toBe(true);
    const row13 = lines.find((l) => l.startsWith("13:00"))!;
    const nums = row13.trim().split(/\s+/);
    const index = Number(nums[1]);
    const parts = nums.slice(-6).map(Number);
    // Named by position (par, pace, sup, read, strk, late), not just their sum:
    // 5 sessions saturate par, 55 prompts saturate pace, 25 decisions alone put
    // supervision past its norm (3*25 = 75 > 45), 55 replies x 1000 tokens give
    // read 10*(55000/80000) = 6.875 -> 6.9, a streak already past the 120-minute
    // cap by 13:00 saturates strk, and 13:00 isn't a late hour. Index 86.875 -> 87.
    expect(parts).toEqual([25, 15, 30, 6.9, 10, 0]);
    expect(Math.round(parts.reduce((a, b) => a + b, 0))).toBe(index);
  });

  test("--explain columns on a row where no two parts share a value", () => {
    // Monday 23:00: the late-night calm tail (calm(14, 7, 23, 24), one lone
    // session, 6 prompts and 6 replies of 100 tokens). parallel 0 (1 session),
    // pace 15 · min(1, 6/20) = 4.5, supervision 0 (no decisions, no reports and
    // one session means no context switches), reading 10 · (600/80000) = 0.075
    // rounded to 0.1, streak 10 · min(1, 53/120) = 4.4167 rounded to 4.4
    // (streakMin 53, a fresh streak since the evening session ended over an hour
    // earlier), late 10 (23:00 is in the late-night set). Index
    // 0 + 4.5 + 0 + 0.075 + 4.4167 + 10 = 18.99 -> 19. Every part here holds a
    // different value, so a swap between any two accessors fails on this row
    // even though 13:00's saturated row would not notice it.
    const lines = renderDay(monday, { explain: true, color: false }).split("\n");
    const row23 = lines.find((l) => l.startsWith("23:00"))!;
    const nums = row23.trim().split(/\s+/);
    const index = Number(nums[1]);
    const parts = nums.slice(-6).map(Number);
    expect(parts).toEqual([0, 4.5, 0, 0.1, 4.4, 10]);
    expect(index).toBe(19);
    expect(Math.round(parts.reduce((a, b) => a + b, 0))).toBe(index);
  });
});

describe("json", () => {
  test("renderJson is pretty JSON of the same data", () => {
    expect(JSON.parse(renderJson(days))).toEqual(JSON.parse(JSON.stringify(days)));
    expect(renderJson(monday).startsWith("{\n")).toBe(true);
  });
});
