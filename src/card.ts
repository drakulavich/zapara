// Card data: which of four characters a window is, the sentence behind it, the
// peak hour, the load spectrum and three highlights, every value already
// formatted for the page. Pure: Day[] in, CardData out. Nothing here knows a
// date, a path or a file, so nothing here can leak one.
import { NORMS, WEIGHTS } from "./score.ts";
import type { Day, HourBucket, Level, Score } from "./types.ts";

export type Character = "conductor" | "supervisor" | "marathoner" | "nightOwl";
export type Segment = { text: string; strong: boolean };
export type HighlightKey = "peakSessions" | "contextSwitches" | "longestStreak" | "reportsRead" | "tokensRead" | "interrupts" | "lateShare";
export type Highlight = { key: HighlightKey; value: string; caption: string };
export type Spectrum = { calm: number; warming: number; heating: number; fried: number };
export type CardData = {
  days: number;
  character: Character;
  name: string;
  sentence: Segment[];
  motto: string;
  shares: Record<Character, number>;
  peak: { index: number; level: Level };
  spectrum: Spectrum;
  highlights: Highlight[];
};

// Tie order: the first of equal shares wins.
export const CHARACTERS: readonly Character[] = ["conductor", "supervisor", "marathoner", "nightOwl"];
export const NAMES: Record<Character, string> = {
  conductor: "The Conductor", supervisor: "The Supervisor", marathoner: "The Marathoner", nightOwl: "The Night Owl",
};
export const MOTTOS: Record<Character, string> = {
  conductor: "You run agents like an orchestra.",
  supervisor: "Nothing ships without your eyes on it.",
  marathoner: "You do not stop while it compiles.",
  nightOwl: "The best commits happen after midnight.",
};
// Ranking norms for the third highlight: a value over its norm says how remarkable
// it is next to the others. Sums are per active hour. These rank a picture and
// never touch the index; the index's own norms stay in score.ts.
const CARD_NORMS = { reportsPerHour: 12, tokensPerHour: 65_000, interruptsPerHour: 3, latePercent: 25 } as const;
const OWNED: Record<Character, [HighlightKey, HighlightKey]> = {
  conductor: ["peakSessions", "contextSwitches"],
  supervisor: ["reportsRead", "tokensRead"],
  marathoner: ["longestStreak", "interrupts"],
  nightOwl: ["lateShare", "longestStreak"],
};
const POOL: readonly HighlightKey[] = ["peakSessions", "contextSwitches", "longestStreak", "reportsRead", "tokensRead", "interrupts", "lateShare"];
const CAPTIONS: Record<HighlightKey, string> = {
  peakSessions: "sessions at once",
  contextSwitches: "switches in one hour",
  longestStreak: "longest streak",
  reportsRead: "agent reports read",
  tokensRead: "tokens of output read",
  interrupts: "times you stopped Claude",
  lateShare: "of hours after midnight",
};

// Compact formats with a fixed longest form of five characters, so the layout
// is sized once. Decimals are truncated, not rounded: 9.96M stays "9.9M".
function ladder(n: number): string {
  if (n >= 1e12) return "999B+";
  for (const [unit, size] of [["B", 1e9], ["M", 1e6], ["k", 1e3]] as const) {
    if (n < size) continue;
    const v = n / size;
    if (unit !== "k" && v < 10) return `${(Math.floor(v * 10) / 10).toFixed(1)}${unit}`;
    return `${Math.floor(v)}${unit}`;
  }
  return String(n);
}
export const formatCount = (n: number): string => (n < 10_000 ? String(n) : ladder(n));
export const formatTokens = (n: number): string => (n < 1000 ? String(n) : ladder(n));
export function formatStreak(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 10) return `${h}h${String(min % 60).padStart(2, "0")}m`;
  if (h < 1000) return `${h}h`;
  return "999h+";
}
const percent = (part: number, whole: number): number => Math.round((100 * part) / whole);

// Whole percents that sum to 100: floors first, then one more to the largest
// remainders, ties resolved in the given order.
function largestRemainder(counts: number[], total: number): number[] {
  const raw = counts.map((c) => (100 * c) / total);
  const out = raw.map((r) => Math.floor(r));
  let left = 100 - out.reduce((a, b) => a + b, 0);
  const byRemainder = raw.map((r, i) => ({ i, rem: r - Math.floor(r) })).sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of byRemainder) {
    if (left === 0) break;
    out[i]! += 1;
    left -= 1;
  }
  return out;
}

const strong = (text: string): Segment => ({ text, strong: true });
const plain = (text: string): Segment => ({ text, strong: false });
export const sentenceText = (segments: Segment[]): string => segments.map((s) => s.text).join("");

type Active = HourBucket & { score: Score };

export function cardData(days: Day[], w: { days: number }): CardData | null {
  const active = days.flatMap((d) => d.buckets).filter((b): b is Active => b.score !== null);
  const n = active.length;
  if (n === 0) return null;
  const sum = (f: (b: Active) => number): number => active.reduce((a, b) => a + f(b), 0);
  const max = (f: (b: Active) => number): number => active.reduce((a, b) => Math.max(a, f(b)), 0);
  const count = (level: Level): number => active.filter((b) => b.score.level === level).length;

  // Each share is the fraction of that character's maximum possible points the
  // window collected, so a 10-point component competes fairly with a 40-point one.
  const shares: Record<Character, number> = {
    conductor: sum((b) => b.score.parts.parallel + b.score.parts.pace) / ((WEIGHTS.parallel + WEIGHTS.pace) * n),
    supervisor: sum((b) => b.score.parts.supervision + b.score.parts.reading) / ((WEIGHTS.supervision + WEIGHTS.reading) * n),
    marathoner: sum((b) => b.score.parts.streak) / (WEIGHTS.streak * n),
    nightOwl: sum((b) => b.score.parts.late) / (WEIGHTS.late * n),
  };
  // Strict > keeps the earlier of equal shares: CHARACTERS is the tie order.
  const character = CHARACTERS.reduce((best, c) => (shares[c] > shares[best] ? c : best));

  const maxSessions = max((b) => b.sessions);
  const maxSwitches = max((b) => b.contextSwitches);
  const maxStreak = max((b) => b.streakMin);
  const reports = sum((b) => b.reports);
  const tokens = sum((b) => b.outputTokens);
  const interrupts = sum((b) => b.interrupts);
  const late = percent(active.filter((b) => b.lateNight).length, n);
  const calm = percent(count("Calm"), n);

  const sentences: Record<Character, Segment[]> = {
    conductor: [strong(`${formatCount(maxSessions)} sessions`), plain(" at once, "), strong(`${formatCount(maxSwitches)} context switches`), plain(" in one hour.")],
    supervisor: [strong(`${formatCount(reports)} agent reports`), plain(" and "), strong(`${formatTokens(tokens)} tokens`), plain(" of output read.")],
    marathoner: [plain("Longest streak "), strong(formatStreak(maxStreak)), plain(" without a break, "), strong(`${calm}%`), plain(" of your hours calm.")],
    nightOwl: [strong(`${late}%`), plain(" of your hours "), strong("after midnight"), plain(".")],
  };

  const peakBucket = active.reduce((a, b) => (b.score.index > a.score.index ? b : a));
  const [calmPct, warmingPct, heatingPct, friedPct] = largestRemainder(
    [count("Calm"), count("Warming"), count("Heating"), count("Fried")], n);

  const values: Record<HighlightKey, string> = {
    peakSessions: formatCount(maxSessions),
    contextSwitches: formatCount(maxSwitches),
    longestStreak: formatStreak(maxStreak),
    reportsRead: formatCount(reports),
    tokensRead: formatTokens(tokens),
    interrupts: formatCount(interrupts),
    lateShare: `${late}%`,
  };
  const norms: Record<HighlightKey, number> = {
    peakSessions: (maxSessions - 1) / NORMS.parallelSpan,
    contextSwitches: maxSwitches / NORMS.supervisionPerHour,
    longestStreak: maxStreak / NORMS.streakMin,
    reportsRead: reports / (CARD_NORMS.reportsPerHour * n),
    tokensRead: tokens / (CARD_NORMS.tokensPerHour * n),
    interrupts: interrupts / (CARD_NORMS.interruptsPerHour * n),
    lateShare: late / CARD_NORMS.latePercent,
  };
  const owned = OWNED[character];
  // A late-night number on anyone but the Night Owl is the kind of thing they would hide.
  const rest = POOL.filter((k) => !owned.includes(k) && (k !== "lateShare" || character === "nightOwl"));
  const third = rest.reduce((best, k) => (norms[k] > norms[best] ? k : best));
  const highlights = [...owned, third].map((key) => ({ key, value: values[key], caption: CAPTIONS[key] }));

  return {
    days: w.days,
    character,
    name: NAMES[character],
    sentence: sentences[character],
    motto: MOTTOS[character],
    shares,
    peak: { index: peakBucket.score.index, level: peakBucket.score.level },
    spectrum: { calm: calmPct!, warming: warmingPct!, heating: heatingPct!, fried: friedPct! },
    highlights,
  };
}
