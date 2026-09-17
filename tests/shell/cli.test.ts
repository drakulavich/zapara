import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assistant, interrupt, prompt, sidechain, writeTree } from "../helpers/transcript.ts";

const CLI = join(import.meta.dir, "../../src/index.ts");
const A = "aaaaaaaa-1111-4111-8111-111111111111";
const B = "bbbbbbbb-1111-4111-8111-111111111111";
let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "zapara-cli-"));
  await writeTree(root, [
    { path: "-Users-me-proj/a.jsonl", lines: [prompt("2026-09-14T13:00:00.000Z", A), assistant("2026-09-14T13:02:00.000Z", A), interrupt("2026-09-14T13:03:00.000Z", A)], mtime: "2026-09-14T13:03:00.000Z" },
    { path: "-Users-me-proj/b.jsonl", lines: [prompt("2026-09-14T13:05:00.000Z", B)], mtime: "2026-09-14T13:05:00.000Z" },
    { path: "-Users-me-proj/a/subagents/agent-1.jsonl", lines: [sidechain("2026-09-14T13:01:00.000Z", A)], mtime: "2026-09-14T13:01:00.000Z" },
    { path: "-Users-me-old/old.jsonl", lines: [prompt("2026-09-01T13:00:00.000Z", A)], mtime: "2026-09-01T13:00:00.000Z" },
  ]);
});
afterAll(() => rm(root, { recursive: true, force: true }));

async function run(...args: string[]): Promise<{ code: number; out: string; err: string }> {
  const p = Bun.spawn(["bun", CLI, "--projects", root, ...args], { stdout: "pipe", stderr: "pipe", env: { ...process.env, TZ: "UTC", NO_COLOR: "1" } });
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  return { code, out, err };
}

describe("cli", () => {
  test("week --json prints one entry per day with the hour buckets", async () => {
    const r = await run("week", "--to", "2026-09-14", "--days", "2", "--json");
    expect(r.code).toBe(0);
    const days = JSON.parse(r.out);
    expect(days.map((d: { date: string }) => d.date)).toEqual(["2026-09-13", "2026-09-14"]);
    const b = days[1].buckets[13];
    expect(b.sessions).toBe(2);
    expect(b.prompts).toBe(2);
    expect(b.interrupts).toBe(1);
    expect(b.contextSwitches).toBe(1);
    expect(b.score.index).toBe(10); // parallel 7.5 + pace 1 + decisions 1 + streak 0.6 (5 min) = 10.1
  });

  test("day --json prints one day", async () => {
    const r = await run("day", "2026-09-14", "--json");
    expect(r.code).toBe(0);
    const d = JSON.parse(r.out);
    expect(d.date).toBe("2026-09-14");
    expect(d.totals.prompts).toBe(2);
  });

  test("stdout in a pipe is JSON even without --json", async () => {
    const r = await run("day", "2026-09-14");
    expect(() => JSON.parse(r.out)).not.toThrow();
  });

  test("a window with no data prints empty days and exits 0", async () => {
    const r = await run("week", "--to", "2026-08-20", "--days", "1", "--json");
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out)[0].peak).toBeNull();
  });

  test("bad date, bad --days, unknown flag and unknown command exit 2 with one line", async () => {
    for (const args of [["day", "2026-13-40"], ["day", "14.09.2026"], ["week", "--days", "0"], ["week", "--days", "91"], ["week", "--bogus"], ["month"]]) {
      const r = await run(...args);
      expect(r.code).toBe(2);
      expect(r.out).toBe("");
      expect(r.err.split("\n")[0]!.startsWith("zapara: ")).toBe(true);
      expect(r.err).toContain("usage");
    }
  });

  test("missing projects directory exits 1 with one line and no stack trace", async () => {
    const p = Bun.spawn(["bun", CLI, "--projects", join(root, "nope"), "week", "--json"], { stdout: "pipe", stderr: "pipe" });
    const [err, code] = await Promise.all([new Response(p.stderr).text(), p.exited]);
    expect(code).toBe(1);
    expect(err.trim().split("\n")).toHaveLength(1);
    expect(err).not.toContain("    at ");
  });

  test("--help exits 0 and --version prints the version", async () => {
    expect((await run("--help")).code).toBe(0);
    expect((await run("--version")).out.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
