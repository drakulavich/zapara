#!/usr/bin/env bun
// zapara CLI. Argument parsing, the clock, stdout and exit codes live here; everything else is pure.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { cardData, sentenceText } from "./card.ts";
import { cardHtml } from "./cardhtml.ts";
import { localDate } from "./derive.ts";
import { loadAssets, renderCard } from "./image.ts";
import { renderDay, renderJson, renderWeek } from "./render.ts";
import { report } from "./report.ts";
import type { Day } from "./types.ts";

// Read lazily, only when --version is actually handled, so a broken install
// (missing or corrupt package.json) fails inside the guarded catch below
// instead of throwing at module load, before any try/catch is in place.
function version(): string {
  const parsed: unknown = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  if (typeof parsed === "object" && parsed !== null && typeof (parsed as { version?: unknown }).version === "string") {
    return (parsed as { version: string }).version;
  }
  throw new Error("package.json has no version");
}

const USAGE = `usage: zapara [window]                 the last 7 days, one cell per hour
       zapara today|yesterday|<date>   one day, one row per active hour
       zapara card [window] [--out]    the last 14 days as one picture

window:
  --days <N>        the last N days, 1..90; with --to, N days ending there
  --from <date>     first day; --to <date> last day, default today
                    a date is YYYY-MM-DD, today or yesterday

options:
  --explain         with a day: the six weighted parts behind each index
  --out <path>      with card: .png, .webp or .html (default zapara-card.png)
  --json            the same data as JSON; a pipe gets JSON without asking
  --projects <dir>  read this directory instead of ~/.claude/projects
  --no-color        no ANSI colors; NO_COLOR does the same
  -h, --help  -V, --version

levels: calm 0-29  warming 30-59  heating 60-84  fried 85-100`;
const HINT = "run 'zapara --help' for usage";

// A grid is the window as one cell per hour; a day is one date as one row per hour.
type Args = { command: "grid" | "day" | "card"; to: string; days: number; explain: boolean; json: boolean; out: string; projects: string; color: boolean };

class UsageError extends Error {}
// Thrown only at a flag position (never when a token was consumed as another
// flag's value, e.g. `--to --help`), so `main()` can short-circuit to exit 0
// without parseArgs having to also validate the rest of a help/version call.
class HelpRequested extends Error {}
class VersionRequested extends Error {}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

// A usage error quotes the offending value only when it is short, printable ASCII
// with no path separator: the CLI never prints a filesystem path or an escape,
// not even one the person typed.
const quotable = (v: string): boolean => /^[\x21-\x7e]{1,24}$/.test(v) && !/[\/\\]/.test(v);
const got = (v: string): string => (quotable(v) ? `, got ${v}` : "");
const named = (v: string): string => (quotable(v) ? ` ${v}` : "");

function validDate(s: string): boolean {
  const m = DATE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}

// A date on the command line: YYYY-MM-DD, today or yesterday, in local time.
function resolveDate(what: string, s: string, now: Date): string {
  if (s === "today") return localDate(now);
  if (s === "yesterday") return localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  if (!validDate(s)) throw new UsageError(`${what} must be YYYY-MM-DD, today or yesterday${got(s)}`);
  return s;
}

// Calendar days from one date to another, inclusive; UTC arithmetic so a DST day is still one day.
function spanDays(from: string, to: string): number {
  const [f, t] = [from, to].map((s) => DATE.exec(s)!.slice(1).map(Number));
  return Math.round((Date.UTC(t![0]!, t![1]! - 1, t![2]!) - Date.UTC(f![0]!, f![1]! - 1, f![2]!)) / 86_400_000) + 1;
}

const VALUE_FLAGS = new Set(["--projects", "--from", "--to", "--days", "--out"]);

function parseArgs(argv: string[], now: Date, env: NodeJS.ProcessEnv, isTTY: boolean): Args {
  const a: Args = { command: "grid", to: localDate(now), days: 7, explain: false, json: false, out: "zapara-card.png", projects: join(homedir(), ".claude", "projects"), color: isTTY && !env.NO_COLOR };
  let days: string | null = null;
  let from: string | null = null;
  let to: string | null = null;
  let jsonFlag = false;
  let outGiven = false;
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    let arg = argv[i]!;
    // `--days=30` is `--days 30`; the inline value is used only by a flag that takes one.
    let inline: string | null = null;
    const eq = arg.startsWith("--") ? arg.indexOf("=") : -1;
    if (eq > 0 && VALUE_FLAGS.has(arg.slice(0, eq))) { inline = arg.slice(eq + 1); arg = arg.slice(0, eq); }
    // A missing value or one that looks like another flag is a usage error,
    // never treated as this flag's value (e.g. `--projects --json`). Only --days
    // takes a negative number as a value, so `--days -1` reaches the range check.
    const value = (negativeNumberIsValue = false): string => {
      if (inline !== null) return inline;
      const v = argv[++i];
      if (v === undefined || (v.startsWith("-") && !(negativeNumberIsValue && /^-\d/.test(v)))) throw new UsageError(`${arg} needs a value`);
      return v;
    };
    switch (arg) {
      case "--help":
      case "-h": throw new HelpRequested();
      case "--version":
      case "-V": throw new VersionRequested();
      case "--json": jsonFlag = true; break;
      case "--explain": a.explain = true; break;
      case "--no-color": a.color = false; break;
      case "--projects": a.projects = value(); break;
      case "--from": from = value(); break;
      case "--to": to = value(); break;
      case "--days": days = value(true); break;
      case "--out": a.out = value(); outGiven = true; break;
      default:
        if (arg.startsWith("-")) throw new UsageError(`unknown flag${named(arg)}`);
        positional.push(arg);
    }
  }
  if (positional.length > 1) throw new UsageError(`unexpected argument${named(positional[1]!)}`);
  const [word] = positional;
  if (word === undefined) a.command = "grid";
  else if (word === "card") a.command = "card";
  else if (word === "today" || word === "yesterday" || DATE.test(word)) { a.command = "day"; a.to = resolveDate("date", word, now); a.days = 1; }
  else throw new UsageError(`unknown command${named(word)} (try today, yesterday, a date or card)`);

  if (a.command === "day") {
    if (days !== null || from !== null || to !== null) throw new UsageError("--days, --from and --to do not apply to a named day");
  } else {
    // The window: --days ending today, or --from/--to; both at once is one length too many.
    if (from !== null && days !== null) throw new UsageError("--from sets the length; drop --days");
    if (days !== null && (!/^\d+$/.test(days) || Number(days) < 1 || Number(days) > 90)) throw new UsageError(`--days must be 1..90${got(days)}`);
    if (to !== null) a.to = resolveDate("--to", to, now);
    if (from !== null) {
      const first = resolveDate("--from", from, now);
      a.days = spanDays(first, a.to);
      if (a.days < 1) throw new UsageError(`--from ${first} is after --to ${a.to}`);
      if (a.days > 90) throw new UsageError(`--from ${first} to ${a.to} is ${a.days} days; the most is 90`);
    } else {
      // Two weeks make a pattern; a week makes a picture of one week.
      a.days = days !== null ? Number(days) : a.command === "card" ? 14 : 7;
    }
  }
  // Tables turn into JSON in a pipe; the card is a file either way, so only an explicit --json switches it.
  a.json = a.command === "card" ? jsonFlag : jsonFlag || !isTTY;
  if (a.command !== "day" && a.explain) throw new UsageError("--explain applies to a named day only");
  if (a.command !== "card" && outGiven) throw new UsageError("--out applies to card only");
  // The value is printed back verbatim in `wrote \u2026`, so it must be one plain line:
  // no control character, and the message never quotes it.
  if (/[\x00-\x1f\x7f]/.test(a.out)) throw new UsageError("--out must not contain control characters");
  if (!/\.(png|webp|html)$/i.test(a.out)) throw new UsageError("--out must end in .png, .webp or .html");
  return a;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const a = parseArgs(argv, new Date(), process.env, process.stdout.isTTY === true);
  if (a.command === "card") return card(a);
  const days: Day[] = await report({ projects: a.projects, to: a.to, days: a.days });
  const data = a.command === "day" ? days[0] : days;
  if (a.json) console.log(renderJson(data!));
  else if (a.command === "day") console.log(renderDay(days[0]!, { explain: a.explain, color: a.color }));
  else console.log(renderWeek(days, a.color));
  return 0;
}

async function card(a: Args): Promise<number> {
  const days: Day[] = await report({ projects: a.projects, to: a.to, days: a.days });
  const data = cardData(days, { days: a.days });
  if (data === null) throw new Error(`no activity in the last ${a.days} days`);
  if (a.json) {
    const round2 = (x: number): number => Math.round(x * 100) / 100;
    const json = {
      from: days[0]!.date, to: days[days.length - 1]!.date, days: data.days, character: data.character, name: data.name,
      sentence: sentenceText(data.sentence), motto: data.motto,
      shares: { conductor: round2(data.shares.conductor), supervisor: round2(data.shares.supervisor), marathoner: round2(data.shares.marathoner), nightOwl: round2(data.shares.nightOwl) },
      peak: data.peak, spectrum: data.spectrum, highlights: data.highlights,
    };
    console.log(JSON.stringify(json, null, 2));
    return 0;
  }
  await renderCard(cardHtml(data, await loadAssets()), a.out);
  console.log(`${data.name}: ${sentenceText(data.sentence)}\nwrote ${a.out}`);
  return 0;
}

if (import.meta.main) {
  main().then((code) => process.exit(code), (e: unknown) => {
    if (e instanceof HelpRequested) { console.log(USAGE); process.exit(0); }
    if (e instanceof VersionRequested) {
      try { console.log(version()); process.exit(0); }
      catch (err) { console.error(`zapara: ${err instanceof Error ? err.message : String(err)}`); process.exit(1); }
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (e instanceof UsageError) { console.error(`zapara: ${msg}\n${HINT}`); process.exit(2); }
    console.error(`zapara: ${msg}`);
    process.exit(1);
  });
}
