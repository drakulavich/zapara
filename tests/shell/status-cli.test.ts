import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmod, lstat, mkdtemp, readdir, readFile, rm, stat, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assistant, prompt, writeTree } from "../helpers/transcript.ts";

const CLI = join(import.meta.dir, "../../src/index.ts");
const A = "aaaaaaaa-1111-4111-8111-111111111111";
const utcDay = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
let projects: string;
// A throwaway working directory for every run: with HOME empty, bun puts its
// own cache under the working directory, and the suite must not leave that in
// the checkout.
let cwd: string;

// Every run gets its own HOME, so the file each test asserts on is only ever
// written by that test's own runs.
const spawn = (home: string, ...args: string[]): Promise<{ code: number; out: string; err: string }> => {
  const p = Bun.spawn(["bun", CLI, "status", ...args], { cwd, stdout: "pipe", stderr: "pipe", env: { ...process.env, TZ: "UTC", NO_COLOR: "1", HOME: home } });
  return Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]).then(([out, err, code]) => ({ code, out, err }));
};
const run = (home: string, ...args: string[]) => spawn(home, "--projects", projects, ...args);
const home = () => mkdtemp(join(tmpdir(), "zapara-status-home-"));
const dirOf = (h: string) => join(h, ".claude", "zapara");
const statusPath = (h: string) => join(dirOf(h), "status.json");
const tmps = async (h: string) => (await readdir(dirOf(h))).filter((n) => n.endsWith(".tmp"));

beforeAll(async () => {
  projects = await mkdtemp(join(tmpdir(), "zapara-status-proj-"));
  cwd = await mkdtemp(join(tmpdir(), "zapara-status-cwd-"));
  const d = utcDay(0);
  await writeTree(projects, [{ path: "-Users-me-proj/t.jsonl", lines: [prompt(`${d}T00:00:00.000Z`, A), assistant(`${d}T00:02:00.000Z`, A)], mtime: `${d}T00:02:00.000Z` }]);
});
afterAll(async () => {
  await rm(projects, { recursive: true, force: true });
  await rm(cwd, { recursive: true, force: true });
});

describe("zapara status", () => {
  test("writes one JSON line to ~/.claude/zapara/status.json and prints it", async () => {
    const h = await home();
    const r = await run(h);
    expect([r.code, r.err]).toEqual([0, ""]);
    const file = await readFile(statusPath(h), "utf8");
    expect(r.out).toBe(file);
    expect(file.endsWith("\n") && file.split("\n").length === 2).toBe(true);
    const s = JSON.parse(file);
    expect(Object.keys(s)).toEqual(["schema", "asOf", "date", "hour", "index", "level", "peak", "activeMin", "streakMin"]);
    expect(s.schema).toBe(1);
    expect(s.date).toBe(utcDay(0));
    expect(s.asOf).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect((await stat(statusPath(h))).mode & 0o777).toBe(0o600);
    expect((await stat(dirOf(h))).mode & 0o777).toBe(0o700);
    expect(await tmps(h)).toEqual([]);
  });

  test("four runs at once leave one complete line and no temp file", async () => {
    const h = await home();
    const rs = await Promise.all([run(h), run(h), run(h), run(h)]);
    expect(rs.map((r) => r.code)).toEqual([0, 0, 0, 0]);
    const file = await readFile(statusPath(h), "utf8");
    expect(JSON.parse(file).schema).toBe(1);
    expect(await tmps(h)).toEqual([]);
  });

  test("a temp file it did not create is left alone", async () => {
    const h = await home();
    await run(h);
    const foreign = join(dirOf(h), "status.json.1.abc.tmp");
    await writeFile(foreign, "not ours\n");
    await utimes(foreign, new Date(0), new Date(0));
    expect((await run(h)).code).toBe(0);
    expect(await readFile(foreign, "utf8")).toBe("not ours\n");
  });

  test("a symlink at the target is replaced, its target untouched", async () => {
    const h = await home();
    await run(h);
    const elsewhere = join(h, "elsewhere.json");
    await writeFile(elsewhere, "keep\n");
    await rm(statusPath(h));
    await symlink(elsewhere, statusPath(h));
    expect((await run(h)).code).toBe(0);
    expect((await lstat(statusPath(h))).isSymbolicLink()).toBe(false);
    expect(await readFile(elsewhere, "utf8")).toBe("keep\n");
  });

  test("a failed read leaves the last good file untouched and names no path", async () => {
    if (process.getuid?.() === 0) return; // root bypasses file permissions
    const h = await home();
    await run(h);
    const before = await readFile(statusPath(h), "utf8");
    const locked = await mkdtemp(join(tmpdir(), "zapara-status-locked-"));
    try {
      await chmod(locked, 0o000);
      const r = await spawn(h, "--projects", locked);
      expect(r.code).toBe(1);
      expect(r.out).toBe("");
      expect(r.err.split("\n").filter(Boolean)).toHaveLength(1);
      expect(r.err).not.toContain(locked);
    } finally {
      await chmod(locked, 0o700).catch(() => {});
      await rm(locked, { recursive: true, force: true });
    }
    expect(await readFile(statusPath(h), "utf8")).toBe(before);
  });

  test("an empty HOME is the write error", async () => {
    const r = await run("");
    expect(r.code).toBe(1);
    expect(r.out).toBe("");
    expect(r.err).toBe("zapara: cannot write the status file\n");
  });

  test("window flags, --explain and --out are usage errors on status", async () => {
    const h = await home();
    for (const [args, msg] of [
      [["--days", "3"], "--days, --from and --to do not apply to status"],
      [["--from", "2026-09-14"], "--days, --from and --to do not apply to status"],
      [["--to", "2026-09-14"], "--days, --from and --to do not apply to status"],
      [["--explain"], "--explain applies to a named day only"],
      [["--out", "x.png"], "--out applies to card only"],
    ] as const) {
      const r = await run(h, ...args);
      expect([args.join(" "), r.code, r.out, r.err.split("\n")[0]]).toEqual([args.join(" "), 2, "", `zapara: ${msg}`]);
    }
  });
});
