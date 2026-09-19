import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cardData } from "../../src/card.ts";
import { cardHtml } from "../../src/cardhtml.ts";
import { loadAssets } from "../../src/image.ts";
import { report } from "../../src/report.ts";
import { webviewMissing } from "../helpers/webview.ts";

const CLI = join(import.meta.dir, "../../src/index.ts");
const projects = join(import.meta.dir, "../fixtures/busy-week/projects");
let cwd: string;
beforeEach(async () => { cwd = await mkdtemp(join(tmpdir(), "zapara-card-")); });
afterEach(() => rm(cwd, { recursive: true, force: true }));

async function run(...args: string[]): Promise<{ code: number; out: string; err: string }> {
  const p = Bun.spawn(["bun", CLI, "--projects", projects, ...args], { cwd, stdout: "pipe", stderr: "pipe", env: { ...process.env, TZ: "UTC", NO_COLOR: "1" } });
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  return { code, out, err };
}
const files = () => readdir(cwd);

describe("zapara card", () => {
  test("--out x.html writes exactly the cardHtml string and prints the two lines", async () => {
    const r = await run("card", "--to", "2026-09-20", "--out", "./x.html");
    expect(r.code).toBe(0);
    expect(r.out).toBe("The Marathoner: Longest streak 7h53m without a break, 68% of your hours calm.\nwrote ./x.html\n");
    const expected = cardHtml(cardData(await report({ projects, to: "2026-09-20", days: 14 }), { days: 14 })!, await loadAssets());
    expect(await readFile(join(cwd, "x.html"), "utf8")).toBe(expected);
  });

  test("--out X.HTML is case-insensitive and writes exactly the cardHtml string", async () => {
    const r = await run("card", "--to", "2026-09-20", "--out", "X.HTML");
    expect(r.code).toBe(0);
    expect(r.out.endsWith("wrote X.HTML\n")).toBe(true);
    const expected = cardHtml(cardData(await report({ projects, to: "2026-09-20", days: 14 }), { days: 14 })!, await loadAssets());
    expect(await readFile(join(cwd, "X.HTML"), "utf8")).toBe(expected);
  });

  test("--json prints the data with the window's dates and writes no file", async () => {
    const r = await run("card", "--to", "2026-09-20", "--json");
    expect(r.code).toBe(0);
    const j = JSON.parse(r.out);
    expect(Object.keys(j)).toEqual(["from", "to", "days", "character", "name", "sentence", "motto", "shares", "peak", "spectrum", "highlights"]);
    expect(j.from).toBe("2026-09-07");
    expect(j.to).toBe("2026-09-20");
    expect(j.days).toBe(14);
    expect(j.sentence).toBe("Longest streak 7h53m without a break, 68% of your hours calm.");
    expect(j.motto).toBe("You do not stop while it compiles.");
    expect(j.shares.marathoner).toBe(0.8);
    expect(j.shares.conductor).toBe(0.31);
    expect(j.peak).toEqual({ index: 87, level: "Fried" });
    expect(j.highlights[0]).toEqual({ key: "longestStreak", value: "7h53m", caption: "longest streak" });
    expect(await files()).toEqual([]);
  });

  test("card takes the grid's window flags: --from/--to set from, to and days", async () => {
    const j = JSON.parse((await run("card", "--from", "2026-09-13", "--to", "2026-09-14", "--json")).out);
    expect([j.from, j.to, j.days]).toEqual(["2026-09-13", "2026-09-14", 2]);
    const k = JSON.parse((await run("card", "--days", "3", "--to", "2026-09-14", "--json")).out);
    expect([k.from, k.to, k.days]).toEqual(["2026-09-12", "2026-09-14", 3]);
    // The window changes the picture: the 14-day card reads 7h53m (the test above); Monday alone does not.
    expect(j.sentence).not.toContain("7h53m");
  });

  test("a pipe without --json still writes the picture", async () => {
    // Rule: card ignores the TTY default that makes the grid and a day print JSON in a pipe.
    const r = await run("card", "--to", "2026-09-20", "--out", "p.html");
    expect(r.out.endsWith("wrote p.html\n")).toBe(true);
    expect(await files()).toEqual(["p.html"]);
  });

  test("the default output is zapara-card.png in the current directory", async () => {
    // Only the argument handling is pinned here; rendering is the test below.
    const r = await run("card", "--to", "2026-09-20", "--out", "zapara-card.html");
    expect(r.out).toContain("wrote zapara-card.html");
    if (webviewMissing === null) {
      const p = await run("card", "--to", "2026-09-20");
      expect(p.code).toBe(0);
      expect(p.out).toContain("wrote zapara-card.png");
      expect(await files()).toContain("zapara-card.png");
    }
  }, 15_000);

  test("an empty window exits 1 with one line and writes nothing", async () => {
    const r = await run("card", "--to", "2026-08-20", "--days", "3", "--out", "x.html");
    expect(r.code).toBe(1);
    expect(r.out).toBe("");
    expect(r.err).toBe("zapara: no activity in the last 3 days\n");
    expect(await files()).toEqual([]);
  });

  test("bad --out values exit 2, print one stderr line without the value, and write nothing", async () => {
    for (const out of ["x.gif", "x", "a\nb.png", "\x1b[31mx.png", "x\x7f.png"]) {
      const r = await run("card", "--to", "2026-09-20", "--out", out);
      expect(r.code).toBe(2);
      expect(r.out).toBe("");
      expect(r.err.startsWith("zapara: --out ")).toBe(true);
      expect(r.err).toContain("run 'zapara --help' for usage");
      expect(r.err).not.toContain("\x1b");
      expect(r.err).not.toContain("a\nb");
      expect(await files()).toEqual([]);
    }
  });

  test("--out on the grid and --explain on card are usage errors", async () => {
    expect((await run("--out", "x.png")).code).toBe(2);
    expect((await run("card", "--explain")).code).toBe(2);
    expect((await run("card", "--days", "91", "--out", "x.html")).code).toBe(2);
  });

  test.skipIf(webviewMissing !== null)("--out x.png and --out x.webp are 2400x1260 pictures", async () => {
    for (const [name, format] of [["x.png", "png"], ["x.webp", "webp"]] as const) {
      const r = await run("card", "--to", "2026-09-20", "--out", name);
      expect(r.code).toBe(0);
      expect(r.out.endsWith(`wrote ${name}\n`)).toBe(true);
      const bytes = await readFile(join(cwd, name));
      expect(bytes.length).toBeGreaterThan(20_000);
      expect(await new Bun.Image(bytes).metadata()).toMatchObject({ width: 2400, height: 1260, format });
    }
  }, 15_000);
});
