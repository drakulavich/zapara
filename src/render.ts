import type { Day, HourBucket, Level } from "./types.ts";

const GLYPH: Record<Level, string> = { Calm: "░", Warming: "▒", Heating: "▓", Fried: "█" };
const ANSI: Record<Level, string> = { Calm: "32", Warming: "33", Heating: "35", Fried: "31" };
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const paint = (s: string, level: Level, color: boolean) => (color ? `\x1b[${ANSI[level]}m${s}\x1b[0m` : s);
const hm = (min: number) => `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;
const label = (date: string) => {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return `${WEEKDAY[new Date(y, m - 1, d).getDay()]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
};

export function renderWeek(days: Day[], color: boolean): string {
  // Geometry: 12-char label, 24 cells of 3 chars (glyph in the middle), peak in 6, active in 8. Header hours are `HH ` so they sit over the cells.
  const header = "            " + Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")} `).join("") + "  peak  active";
  const rows = days.map((d) => {
    const cells = d.buckets.map((b) => ` ${b.score ? paint(GLYPH[b.score.level], b.score.level, color) : "·"} `).join("");
    return `${label(d.date).padEnd(12)}${cells}${String(d.peak ?? "-").padStart(6)}${hm(d.activeMin).padStart(8)}`;
  });
  const legend = "  · none  ░ calm 0-29  ▒ warming 30-59  ▓ heating 60-84  █ fried 85-100";
  const active = days.reduce((s, d) => s + d.activeMin, 0);
  const prompts = days.reduce((s, d) => s + d.totals.prompts, 0);
  const reports = days.reduce((s, d) => s + d.totals.reports, 0);
  const decisions = days.reduce((s, d) => s + d.totals.decisions, 0);
  const maxSessions = Math.max(0, ...days.map((d) => d.totals.maxSessions));
  const totals = `week: active ${hm(active)}, prompts ${prompts}, reports ${reports}, decisions ${decisions}, max sessions ${maxSessions}`;
  return [header, ...rows, "", legend, totals].join("\n");
}

// Values at or above 1000 are shown as one decimal of a thousand (e.g. "41.2k"); smaller values print as-is.
const fmtTokens = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

// Widths reproduce the header the test pins: hour is left-aligned, level is left-aligned inside a 9-wide cell with two leading spaces, everything else right-aligned.
const COLS: [string, number, (b: HourBucket) => string][] = [
  ["hour", 5, (b) => `${String(b.hour).padStart(2, "0")}:00`],
  ["index", 7, (b) => String(b.score?.index ?? "")],
  ["level", 9, (b) => b.score?.level ?? ""],
  ["sess", 6, (b) => String(b.sessions)],
  ["prompts", 9, (b) => String(b.prompts)],
  ["rep", 5, (b) => String(b.reports)],
  ["intr", 6, (b) => String(b.interrupts)],
  ["rej", 5, (b) => String(b.rejects)],
  ["quest", 7, (b) => String(b.questions)],
  ["plan", 6, (b) => String(b.plans)],
  ["mode", 6, (b) => String(b.modeSwitches)],
  ["ctx-sw", 8, (b) => String(b.contextSwitches)],
  ["streak", 8, (b) => `${b.streakMin}m`],
  ["out-tok", 9, (b) => fmtTokens(b.outputTokens)],
];
const EXPLAIN: [string, number, (b: HourBucket) => string][] = [
  ["par", 5, (b) => String(b.score?.parts.parallel ?? "")],
  ["pace", 6, (b) => String(b.score?.parts.pace ?? "")],
  ["sup", 6, (b) => String(b.score?.parts.supervision ?? "")],
  ["read", 6, (b) => String(b.score?.parts.reading ?? "")],
  ["strk", 6, (b) => String(b.score?.parts.streak ?? "")],
  ["late", 6, (b) => String(b.score?.parts.late ?? "")],
];

export function renderDay(day: Day, opts: { explain: boolean; color: boolean }): string {
  const cols = opts.explain ? [...COLS, ...EXPLAIN] : COLS;
  const line = (cells: string[]) => cells.map((c, i) => { const w = cols[i]![1]; if (i === 0) return c.padEnd(w); if (cols[i]![0] === "level") return `  ${c.padEnd(w - 2)}`; return c.padStart(w); }).join("").trimEnd();
  const header = line(cols.map(([name]) => name));
  const rows = day.buckets.filter((b) => b.score !== null).map((b) => {
    const cells = cols.map(([, , f]) => f(b));
    const text = line(cells);
    // Safe only because no other column can contain a level word (Calm/Warming/Heating/Fried);
    // if one ever could, this would need to target the level column's slice, not a string search.
    return opts.color && b.score ? text.replace(b.score.level, paint(b.score.level, b.score.level, true)) : text;
  });
  return [header, ...rows].join("\n");
}

export function renderJson(data: Day[] | Day): string {
  return JSON.stringify(data, null, 2);
}
