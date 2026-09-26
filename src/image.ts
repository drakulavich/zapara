// The only module that reads the card assets, opens a Bun.WebView or Bun.Image,
// writes the card, and starts another program: the opener that shows it.
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { CardAssets } from "./cardhtml.ts";

const ASSETS = new URL("../assets/", import.meta.url);
const FILES = ["fonts/inter-400.woff2", "fonts/inter-700.woff2", "fonts/inter-800.woff2", "fonts/jetbrains-mono-500.woff2", "characters.webp"] as const;

// A missing or empty asset is a broken install, reported without a path.
export async function loadAssets(): Promise<CardAssets> {
  let parts: string[];
  try {
    parts = await Promise.all(FILES.map(async (name) => (await readFile(new URL(name, ASSETS))).toString("base64")));
  } catch {
    throw new Error("assets missing: reinstall zapara");
  }
  const [inter400, inter700, inter800, mono500, characters] = parts;
  if (parts.some((p) => p.length === 0)) throw new Error("assets missing: reinstall zapara");
  return { fonts: { inter400: inter400!, inter700: inter700!, inter800: inter800!, mono500: mono500! }, characters: characters! };
}

const BACKEND = process.platform === "darwin" ? "webkit" : "chrome";
const ENGINE_LINE = "card needs a browser engine: install a Chromium browser such as Chrome or Edge, or write --out card.html";
const WRITE_LINE = "cannot write the card: check the --out directory";
const WIDTH = 2400;
const HEIGHT = 1260;
const READY = 'document.fonts.ready.then(() => document.fonts.status === "loaded" && Array.from(document.images).every((i) => i.complete))';

// The budget bounds the whole render, raced against one timer; the view is
// closed on every path. An engine failure becomes one line that never quotes
// the engine's text; the timeout error passes through unchanged.
export async function renderCard(html: string, out: string, timeoutMs = 15_000): Promise<void> {
  const lower = out.toLowerCase();
  if (lower.endsWith(".html")) {
    await write(out, html);
    return;
  }
  let bytes: Uint8Array;
  let timer: ReturnType<typeof setTimeout>;
  try {
    bytes = await Promise.race([
      (async () => {
        // WebKit draws at the screen's density: at 2x, a 2400-wide viewport made a
        // 4800-wide shot, 2.2 s of a 3 s render. The viewport and the page's zoom
        // (2 in cardHtml) shrink by the density, so the shot is 2400 wide already.
        // Headless Chrome (or Edge) shoots at 1x and cannot evaluate before a navigate.
        let dpr = 1;
        if (BACKEND === "webkit") {
          const probe = new Bun.WebView({ width: 1, height: 1, backend: BACKEND });
          try { dpr = await probe.evaluate<number>("devicePixelRatio"); } finally { probe.close(); }
        }
        const view = new Bun.WebView({ width: Math.round(WIDTH / dpr), height: Math.round(HEIGHT / dpr), backend: BACKEND });
        try {
          await view.navigate("data:text/html;charset=utf-8," + encodeURIComponent(html));
          await view.evaluate(`document.documentElement.style.zoom = "${2 / dpr}"`);
          while (!(await view.evaluate<boolean>(READY))) await Bun.sleep(50);
          const shot = await view.screenshot({ encoding: "buffer", format: "png" });
          const image = new Bun.Image(shot);
          const meta = await image.metadata();
          if (meta.width !== WIDTH || meta.height !== HEIGHT) image.resize(WIDTH, HEIGHT, { fit: "fill" });
          return lower.endsWith(".webp") ? await image.webp({ quality: 90 }).bytes() : await image.png().bytes();
        } finally {
          view.close();
        }
      })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("render timed out")), timeoutMs); }),
    ]);
  } catch (e) {
    if (e instanceof Error && e.message === "render timed out") throw e;
    throw new Error(ENGINE_LINE);
  } finally {
    clearTimeout(timer!);
  }
  await write(out, bytes);
}

// One line for every failure: node's error quotes the path, and the CLI never prints one.
async function write(out: string, data: string | Uint8Array): Promise<void> {
  try {
    await writeFile(out, data);
  } catch {
    throw new Error(WRITE_LINE);
  }
}

// Absolute, so `-card.html` is never an option. `sh … &` with SIGHUP ignored:
// a detached Bun.spawn child, or one in a terminal zapara leads, dies with zapara.
export function openCard(path: string): void {
  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  try {
    Bun.spawnSync(["sh", "-c", 'trap "" HUP; "$0" "$@" </dev/null >/dev/null 2>&1 &', opener, resolve(path)], { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
  } catch {}
}
