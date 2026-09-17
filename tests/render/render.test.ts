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
    expect(lines[10]).toMatch(/^week: active \d+h\d{2}, prompts \d+, decisions \d+, max sessions \d+$/);
  });

  test("Monday reads calm morning, fried storm, quiet evening, late tail", () => {
    const row = lines[1]!;
    const cells = Array.from({ length: 24 }, (_, h) => row[12 + h * 3 + 1]);
    expect(cells.slice(0, 9).join("")).toBe("·········");
    expect(cells[9]).toBe("░");
    expect(cells[12]).toBe("█");
    expect(cells[13]).toBe("█");
    expect(cells[14]).toBe("█");
    expect(cells[16]).toBe("·");
    expect(cells[23]).toBe("░");
    expect(row.slice(84)).toMatch(/^\s+\d{1,3}\s+\d+h\d{2}$/);
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
    expect(lines[0]).toBe("hour   index  level    sess  prompts  intr  rej  quest  plan  mode  ctx-sw  streak");
    const row13 = lines.find((l) => l.startsWith("13:00"))!;
    expect(row13).toMatch(/^13:00\s+\d{1,3}\s+Fried\s+5\s+\d+\s+\d+\s+1\s+1\s+1\s+2\s+\d+\s+\d+m$/);
    expect(lines.some((l) => l.startsWith("03:00"))).toBe(false);
  });

  test("--explain appends the five weighted parts and they add up to the index", () => {
    const lines = renderDay(monday, { explain: true, color: false }).split("\n");
    expect(lines[0]!.endsWith("  par  pace   dec  strk  late")).toBe(true);
    const row13 = lines.find((l) => l.startsWith("13:00"))!;
    const nums = row13.trim().split(/\s+/);
    const index = Number(nums[1]);
    const parts = nums.slice(-5).map(Number);
    expect(Math.round(parts.reduce((a, b) => a + b, 0))).toBe(index);
  });
});

describe("json", () => {
  test("renderJson is pretty JSON of the same data", () => {
    expect(JSON.parse(renderJson(days))).toEqual(JSON.parse(JSON.stringify(days)));
    expect(renderJson(monday).startsWith("{\n")).toBe(true);
  });
});
