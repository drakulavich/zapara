import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { appendFile, cp, mkdtemp, rename, rm, stat, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assistant, prompt, writeTree } from "../helpers/transcript.ts";

const CLI = join(import.meta.dir, "../../src/index.ts");
const A = "aaaaaaaa-1111-4111-8111-111111111111";
const B = "bbbbbbbb-1111-4111-8111-111111111111";
const C = "cccccccc-1111-4111-8111-111111111111";
const DIR = "-Users-me-proj";
let base: string;
let cwd: string;
const temps: string[] = [];

const temp = async (what: string): Promise<string> => {
  const d = await mkdtemp(join(tmpdir(), `zapara-cache-${what}-`));
  temps.push(d);
  return d;
};

beforeAll(async () => {
  base = await temp("tree");
  cwd = await temp("cwd");
  await writeTree(base, [
    { path: `${DIR}/a.jsonl`, lines: [prompt("2026-09-12T09:00:00.000Z", A), assistant("2026-09-12T09:05:00.000Z", A), prompt("2026-09-12T09:30:00.000Z", A), prompt("2026-09-14T10:00:00.000Z", A), assistant("2026-09-14T11:05:00.000Z", A)], mtime: "2026-09-14T11:05:00.000Z" },
    { path: `${DIR}/b.jsonl`, lines: [prompt("2026-09-13T14:00:00.000Z", B), assistant("2026-09-13T15:10:00.000Z", B)], mtime: "2026-09-13T15:10:00.000Z" },
    { path: `${DIR}/c.jsonl`, lines: [prompt("2026-09-14T16:00:00.000Z", C), assistant("2026-09-14T17:20:00.000Z", C)], mtime: "2026-09-14T17:20:00.000Z" },
  ]);
});
afterAll(async () => { for (const d of temps) await rm(d, { recursive: true, force: true }); });

// Each test changes its own copy of the tree and starts with an empty HOME.
async function setup(): Promise<{ home: string; projects: string }> {
  const projects = await temp("proj");
  await cp(base, projects, { recursive: true, preserveTimestamps: true });
  return { home: await temp("home"), projects };
}

async function spawn(home: string, projects: string, ...args: string[]): Promise<{ code: number; out: string; err: string }> {
  const p = Bun.spawn(["bun", CLI, "--projects", projects, "--to", "2026-09-14", "--json", ...args], { cwd, stdout: "pipe", stderr: "pipe", env: { ...process.env, TZ: "UTC", NO_COLOR: "1", HOME: home } });
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  return { code, out, err };
}
const uncached = async (projects: string, ...args: string[]) => spawn(await temp("home"), projects, "--no-cache", ...args);

const lineOf = (err: string, label: string) => err.split("\n").find((l) => l.startsWith(`${label} `));
function hitsOf(err: string): { hits: number; misses: number } {
  const m = /^cache   (\d+) hits?, (\d+) miss(?:es)?$/.exec(lineOf(err, "cache") ?? "");
  if (!m) throw new Error("no cache line with counts");
  return { hits: Number(m[1]), misses: Number(m[2]) };
}
function bucket(out: string, date: string, hour: number): { prompts: number } {
  const day = (JSON.parse(out) as { date: string; buckets: { hour: number; prompts: number }[] }[]).find((d) => d.date === date);
  return day?.buckets.find((b) => b.hour === hour) ?? { prompts: 0 };
}

describe("the transcript cache", () => {
  test("a second run hits every file and prints the first run's output", async () => {
    const { home, projects } = await setup();
    const run1 = await spawn(home, projects, "--verbose");
    const run2 = await spawn(home, projects, "--verbose");
    const off = await spawn(await temp("home"), projects, "--no-cache", "--verbose");
    expect(run2.out).toBe(run1.out);
    expect(run2.out).toBe(off.out);
    expect(run2.code).toBe(0);
    expect(hitsOf(run1.err)).toEqual({ hits: 0, misses: 3 });
    expect(hitsOf(run2.err)).toEqual({ hits: 3, misses: 0 });
    expect(lineOf(run2.err, "read")).toMatch(/^read\s+0 files, /);
    expect(lineOf(off.err, "cache")).toBe("cache   off");
  });

  test("a prompt appended inside the window is counted, and its file is the one miss", async () => {
    const { home, projects } = await setup();
    const a = join(projects, DIR, "a.jsonl");
    const run1 = await spawn(home, projects);
    const { mtime } = await stat(a);
    await appendFile(a, prompt("2026-09-14T10:30:00.000Z", A) + "\n");
    // Same mtime as before, so only the size can tell the file changed.
    await utimes(a, mtime, mtime);
    const run2 = await spawn(home, projects, "--verbose");
    expect(bucket(run2.out, "2026-09-14", 10).prompts).toBe(bucket(run1.out, "2026-09-14", 10).prompts + 1);
    expect(run2.out).toBe((await uncached(projects)).out);
    expect(hitsOf(run2.err)).toEqual({ hits: 2, misses: 1 });
  });

  test("a wider window after a narrow one prints what --no-cache prints", async () => {
    const { home, projects } = await setup();
    await spawn(home, projects, "--days", "1");
    const wide = await spawn(home, projects, "--days", "7");
    expect(wide.code).toBe(0);
    expect(wide.out).toBe((await uncached(projects, "--days", "7")).out);
  });

  test("a narrow run does not replace the rows a wide run wrote", async () => {
    const { home, projects } = await setup();
    await spawn(home, projects, "--days", "7");
    await spawn(home, projects, "--days", "1");
    const third = await spawn(home, projects, "--days", "7", "--verbose");
    expect(hitsOf(third.err)).toEqual({ hits: 3, misses: 0 });
    expect(third.out).toBe((await uncached(projects, "--days", "7")).out);
  });

  test("a renamed transcript is a hit and its output is unchanged", async () => {
    const { home, projects } = await setup();
    const run1 = await spawn(home, projects);
    await rename(join(projects, DIR, "c.jsonl"), join(projects, DIR, "d.jsonl"));
    const run2 = await spawn(home, projects, "--verbose");
    expect(run2.out).toBe(run1.out);
    expect(hitsOf(run2.err)).toEqual({ hits: 3, misses: 0 });
  });

  test("a deleted transcript is skipped", async () => {
    const { home, projects } = await setup();
    const run1 = await spawn(home, projects);
    await rm(join(projects, DIR, "b.jsonl"));
    const run2 = await spawn(home, projects, "--verbose");
    expect(run2.code).toBe(0);
    expect(run2.out).not.toBe(run1.out);
    expect(run2.out).toBe((await uncached(projects)).out);
    expect(hitsOf(run2.err)).toEqual({ hits: 2, misses: 0 });
  });

  test("two runs at once both print what --no-cache prints", async () => {
    const { home, projects } = await setup();
    const [narrow, wide] = await Promise.all([spawn(home, projects, "--days", "1"), spawn(home, projects, "--days", "7")]);
    expect([narrow.code, narrow.err, wide.code, wide.err]).toEqual([0, "", 0, ""]);
    expect(narrow.out).toBe((await uncached(projects, "--days", "1")).out);
    expect(wide.out).toBe((await uncached(projects, "--days", "7")).out);
  });
});
