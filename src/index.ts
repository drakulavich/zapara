#!/usr/bin/env bun
// zapara CLI. Argument parsing, the clock, stdout and exit codes live here; everything else is pure.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { localDate } from "./derive.ts";
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

const USAGE = `usage: zapara [week] [--days N] [--to YYYY-MM-DD]
       zapara day [YYYY-MM-DD] [--explain]
flags: --json  --projects <dir>  --no-color  --help  --version`;

type Args = { command: "week" | "day"; to: string; days: number; date: string | null; explain: boolean; json: boolean; projects: string; color: boolean };

class UsageError extends Error {}
// Thrown only at a flag position (never when a token was consumed as another
// flag's value, e.g. `--to --help`), so `main()` can short-circuit to exit 0
// without parseArgs having to also validate the rest of a help/version call.
class HelpRequested extends Error {}
class VersionRequested extends Error {}

function validDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}

function parseArgs(argv: string[], now: Date, env: NodeJS.ProcessEnv, isTTY: boolean): Args {
  const a: Args = { command: "week", to: localDate(now), days: 7, date: null, explain: false, json: !isTTY, projects: join(homedir(), ".claude", "projects"), color: isTTY && !env.NO_COLOR };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    // A missing value or one that looks like another flag is a usage error,
    // never treated as this flag's value (e.g. `--projects --json`).
    const value = (): string => { const v = argv[++i]; if (v === undefined || v.startsWith("-")) throw new UsageError(`${arg} needs a value`); return v; };
    switch (arg) {
      case "--help":
      case "-h": throw new HelpRequested();
      case "--version": throw new VersionRequested();
      case "--json": a.json = true; break;
      case "--explain": a.explain = true; break;
      case "--no-color": a.color = false; break;
      case "--projects": a.projects = value(); break;
      case "--to": a.to = value(); break;
      case "--days": { const v = value(); if (!/^\d+$/.test(v) || Number(v) < 1 || Number(v) > 90) throw new UsageError(`--days must be 1..90, got ${v}`); a.days = Number(v); break; }
      default:
        if (arg.startsWith("-")) throw new UsageError(`unknown flag ${arg}`);
        positional.push(arg);
    }
  }
  const [cmd, ...rest] = positional;
  if (cmd === undefined || cmd === "week") { if (rest.length) throw new UsageError(`unexpected argument ${rest[0]}`); a.command = "week"; }
  else if (cmd === "day") { a.command = "day"; a.date = rest[0] ?? a.to; if (rest.length > 1) throw new UsageError(`unexpected argument ${rest[1]}`); }
  else throw new UsageError(`unknown command ${cmd}`);
  if (a.command === "week" && a.explain) throw new UsageError("--explain applies to day only");
  if (!validDate(a.to)) throw new UsageError(`--to must be YYYY-MM-DD, got ${a.to}`);
  if (a.date !== null && !validDate(a.date)) throw new UsageError(`date must be YYYY-MM-DD, got ${a.date}`);
  return a;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const a = parseArgs(argv, new Date(), process.env, process.stdout.isTTY === true);
  const days: Day[] = a.command === "day"
    ? await report({ projects: a.projects, to: a.date!, days: 1 })
    : await report({ projects: a.projects, to: a.to, days: a.days });
  const data = a.command === "day" ? days[0] : days;
  if (a.json) console.log(renderJson(data!));
  else if (a.command === "day") console.log(renderDay(days[0]!, { explain: a.explain, color: a.color }));
  else console.log(renderWeek(days, a.color));
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
    if (e instanceof UsageError) { console.error(`zapara: ${msg}\n${USAGE}`); process.exit(2); }
    console.error(`zapara: ${msg}`);
    process.exit(1);
  });
}
