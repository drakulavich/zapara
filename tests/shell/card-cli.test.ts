import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cardData } from "../../src/card.ts";
import { cardHtml } from "../../src/cardhtml.ts";
import { loadAssets } from "../../src/image.ts";
import { report } from "../../src/report.ts";
import { WEBVIEW_TEST_TIMEOUT, webviewMissing } from "../helpers/webview.ts";

const CLI = join(import.meta.dir, "../../src/index.ts");
const projects = join(import.meta.dir, "../fixtures/busy-week/projects");
let cwd: string;
let home: string;
beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "zapara-card-"));
  home = await mkdtemp(join(tmpdir(), "zapara-home-"));
  await mkdir(join(home, "Downloads"));
});
afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
  await rm(home, { recursive: true, force: true });
});

async function run(...args: string[]): Promise<{ code: number; out: string; err: string }> {
  const p = Bun.spawn(["bun", CLI, "--projects", projects, ...args], { cwd, stdout: "pipe", stderr: "pipe", env: { ...process.env, TZ: "UTC", NO_COLOR: "1", HOME: home } });
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  return { code, out, err };
}
const files = () => readdir(cwd);
const downloads = () => readdir(join(home, "Downloads"));

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
    expect(j.shares.marathoner).toBe(0.99); // 217.3 of 220 streak points, rounded to two decimals for the JSON
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

  test.skipIf(webviewMissing !== null)("without --out the card goes to Downloads and the line names the folder, not its path", async () => {
    const r = await run("card", "--to", "2026-09-20");
    expect(r.code).toBe(0);
    expect(r.out).toBe("The Marathoner: Longest streak 7h53m without a break, 68% of your hours calm.\nwrote zapara-card.png to Downloads\n");
    expect(await downloads()).toEqual(["zapara-card.png"]);
    expect(await files()).toEqual([]);
    const bytes = await readFile(join(home, "Downloads", "zapara-card.png"));
    expect(await new Bun.Image(bytes).metadata()).toMatchObject({ width: 2400, height: 1260, format: "png" });
  }, WEBVIEW_TEST_TIMEOUT);

  test("without a Downloads folder the default exits 1 with one line that names no path, and writes nothing", async () => {
    await rm(join(home, "Downloads"), { recursive: true });
    const r = await run("card", "--to", "2026-09-20");
    expect(r.code).toBe(1);
    expect(r.out).toBe("");
    expect(r.err).toBe("zapara: no Downloads folder: pass --out <path>\n");
    expect(await files()).toEqual([]);
    expect(await readdir(home)).not.toContain("Downloads"); // never created
  });

  test("a file named Downloads is not a Downloads folder", async () => {
    await rm(join(home, "Downloads"), { recursive: true });
    await Bun.write(join(home, "Downloads"), "");
    const r = await run("card", "--to", "2026-09-20");
    expect(r.code).toBe(1);
    expect(r.err).toBe("zapara: no Downloads folder: pass --out <path>\n");
  });

  test("--out and --json need no Downloads folder", async () => {
    await rm(join(home, "Downloads"), { recursive: true });
    const o = await run("card", "--to", "2026-09-20", "--out", "c.html");
    expect(o.code).toBe(0);
    expect(o.out.endsWith("wrote c.html\n")).toBe(true);
    expect(await files()).toEqual(["c.html"]);
    const j = await run("card", "--to", "2026-09-20", "--json");
    expect(j.code).toBe(0);
    expect(JSON.parse(j.out).name).toBe("The Marathoner");
    expect(await readdir(home)).not.toContain("Downloads"); // never created
  });

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

  test("a card that cannot be written exits 1 with one line that names no path", async () => {
    // .html needs no browser engine, so this is the write and nothing else.
    const r = await run("card", "--to", "2026-09-20", "--out", join(cwd, "missing", "c.html"));
    expect(r.code).toBe(1);
    expect(r.out).toBe("");
    expect(r.err).toBe("zapara: cannot write the card: check the --out directory\n");
    expect(r.err).not.toContain(cwd);
    expect(r.err).not.toContain("ENOENT");
  });

  test("a directory that refuses the write says the same and still names no path", async () => {
    if (process.getuid?.() === 0) return; // root writes into a 0500 directory anyway
    const locked = join(cwd, "locked");
    await mkdir(locked);
    await chmod(locked, 0o500);
    try {
      const r = await run("card", "--to", "2026-09-20", "--out", join(locked, "c.html"));
      expect(r.code).toBe(1);
      expect(r.out).toBe("");
      expect(r.err).toBe("zapara: cannot write the card: check the --out directory\n");
      expect(r.err).not.toContain(cwd);
      expect(r.err).not.toContain("EACCES");
    } finally {
      await chmod(locked, 0o700).catch(() => {});
    }
  });

  test.skipIf(webviewMissing !== null)("a picture that cannot be written says the same and names no path", async () => {
    // The rendered bytes take a different write from the .html page above, so
    // the picture needs its own proof that no path reaches stderr.
    const r = await run("card", "--to", "2026-09-20", "--out", join(cwd, "missing", "c.png"));
    expect(r.code).toBe(1);
    expect(r.out).toBe("");
    expect(r.err).toBe("zapara: cannot write the card: check the --out directory\n");
    expect(r.err).not.toContain(cwd);
    expect(r.err).not.toContain("ENOENT");
    if (process.getuid?.() === 0) return; // root writes into a 0500 directory anyway
    const locked = join(cwd, "locked-png");
    await mkdir(locked);
    await chmod(locked, 0o500);
    try {
      const l = await run("card", "--to", "2026-09-20", "--out", join(locked, "c.png"));
      expect(l.code).toBe(1);
      expect(l.out).toBe("");
      expect(l.err).toBe("zapara: cannot write the card: check the --out directory\n");
      expect(l.err).not.toContain(cwd);
      expect(l.err).not.toContain("EACCES");
    } finally {
      await chmod(locked, 0o700).catch(() => {});
    }
  }, 30_000);

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
  }, WEBVIEW_TEST_TIMEOUT);
});
