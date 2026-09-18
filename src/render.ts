import { formatCount, plural } from "./format.ts";
import type { Day, HourBucket, Level } from "./types.ts";

const GLYPH: Record<Level, string> = { Calm: "░", Warming: "▒", Heating: "▓", Fried: "█" };
const ANSI: Record<Level, string> = { Calm: "32", Warming: "33", Heating: "35", Fried: "31" };
const LEVEL_NAME: Record<Level, string> = { Calm: "calm", Warming: "warming", Heating: "heating", Fried: "fried" };
const LEVELS: Level[] = ["Calm", "Warming", "Heating", "Fried"];
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const paint = (s: string, level: Level, color: boolean) => (color ? `\x1b[${ANSI[level]}m${s}\x1b[0m` : s);
const dim = (s: string, color: boolean) => (color ? `\x1b[2m${s}\x1b[0m` : s);
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
  // A painted glyph's own \x1b[0m would cancel the line's outer dim, so in
  // color mode re-emit \x1b[2m right after it to keep the label dim too.
  const dimGlyph = (level: Level) => paint(GLYPH[level], level, color) + (color ? "\x1b[2m" : "");
  const legend = dim("  " + LEVELS.map((l) => `${dimGlyph(l)} ${LEVEL_NAME[l]}`).join("   "), color);
  const active = days.reduce((s, d) => s + d.activeMin, 0);
  const prompts = days.reduce((s, d) => s + d.totals.prompts, 0);
  const reports = days.reduce((s, d) => s + d.totals.reports, 0);
  const decisions = days.reduce((s, d) => s + d.totals.decisions, 0);
  const maxSessions = Math.max(0, ...days.map((d) => d.totals.maxSessions));
  // Counts go through formatCount so a very active window (999 999 999 prompts) still
  // fits inside the grid's 100 columns; hm(active) has no compact form, so it stays as is.
  const totals = dim(`  ${hm(active)} active   ${plural(prompts, "prompt")}   ${plural(reports, "report")}   ${plural(decisions, "decision")}   ${plural(maxSessions, "session")} at once`, color);
  return [header, ...rows, "", legend, totals].join("\n");
}

// Values at or above 1000 are shown as one decimal of a thousand (e.g. "41.2k"); smaller values print as-is.
const fmtTokens = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

type Col = [string, number, (b: HourBucket) => string];

// Widths reproduce the header the test pins: hour is left-aligned, level is left-aligned inside a 9-wide cell with two leading spaces, everything else right-aligned.
const COLS: Col[] = [
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
const EXPLAIN: Col[] = [
  ["par", 5, (b) => String(b.score?.parts.parallel ?? "")],
  ["pace", 6, (b) => String(b.score?.parts.pace ?? "")],
  ["sup", 6, (b) => String(b.score?.parts.supervision ?? "")],
  ["read", 6, (b) => String(b.score?.parts.reading ?? "")],
  ["strk", 6, (b) => String(b.score?.parts.streak ?? "")],
  ["late", 6, (b) => String(b.score?.parts.late ?? "")],
];
// Event columns: left out of the table for a day where every active bucket reads
// zero (a quiet day is mostly zeros, and the eye hunts for the non-zero cell).
// The skeleton columns (hour, index, level, sess, prompts, streak, out-tok, and
// the six --explain parts) always show, so two days still line up.
const EVENT_COLS = new Set(["rep", "intr", "rej", "quest", "plan", "mode", "ctx-sw"]);
const FULL_NAME: Record<string, string> = {
  rep: "reports", intr: "interrupts", rej: "rejects", quest: "questions",
  plan: "plans", mode: "mode switches", "ctx-sw": "context switches",
};

export function renderDay(day: Day, opts: { explain: boolean; color: boolean }): string {
  const cols = opts.explain ? [...COLS, ...EXPLAIN] : COLS;
  const line = (columns: Col[], cells: string[]) =>
    cells.map((c, i) => { const w = columns[i]![1]; if (i === 0) return c.padEnd(w); if (columns[i]![0] === "level") return `  ${c.padEnd(w - 2)}`; return c.padStart(w); }).join("").trimEnd();

  const active = day.buckets.filter((b) => b.score !== null);
  // No active bucket: today's plain behavior, the full header and nothing else.
  if (active.length === 0) return line(cols, cols.map(([name]) => name));

  const visible = cols.filter(([name, , f]) => !EVENT_COLS.has(name) || active.some((b) => f(b) !== "0"));
  const leftOut = cols.filter((col) => EVENT_COLS.has(col[0]) && !visible.includes(col));

  const header = line(visible, visible.map(([name]) => name));
  const rows = active.map((b) => {
    const cells = visible.map(([, , f]) => f(b));
    const text = line(visible, cells);
    // Safe only because no other column can contain a level word (Calm/Warming/Heating/Fried);
    // if one ever could, this would need to target the level column's slice, not a string search.
    return opts.color && b.score ? text.replace(b.score.level, paint(b.score.level, b.score.level, true)) : text;
  });
  const lines = [header, ...rows];
  if (leftOut.length > 0) {
    const note = `  no ${leftOut.map(([name]) => FULL_NAME[name]).join(", ")} today`;
    lines.push(dim(note, opts.color));
  }
  return lines.join("\n");
}

export function renderJson(data: Day[] | Day): string {
  return JSON.stringify(data, null, 2);
}
