// The card's shell: the only module that reads the card assets, opens a
// Bun.WebView or a Bun.Image, and writes a file. Everything it writes is the one
// file the person named; nothing here prints.
import { readFile, writeFile } from "node:fs/promises";
import type { CardAssets } from "./cardhtml.ts";

const ASSETS = new URL("../assets/", import.meta.url);
const FILES = ["fonts/inter-400.woff2", "fonts/inter-700.woff2", "fonts/inter-800.woff2", "fonts/jetbrains-mono-500.woff2", "characters.webp"] as const;

// Reads the five files next to the source. A missing, unreadable or empty one is
// a broken install, reported without a path: the CLI never prints one.
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
const ENGINE_LINE = "card needs a browser engine: install Google Chrome, or write --out card.html";
const WIDTH = 2400;
const HEIGHT = 1260;
const READY = 'document.fonts.ready.then(() => document.fonts.status === "loaded" && Array.from(document.images).every((i) => i.complete))';

// Writes the page as is for `.html`; otherwise photographs it at 2400x1260 and
// writes PNG or WebP. The 15s budget bounds the whole render (construct, navigate,
// poll, screenshot, resize, encode), raced against a single timer; the view is
// closed on every path. Any engine failure (constructor, navigate, evaluate,
// screenshot) is mapped to one line that never quotes the engine's own text; the
// timeout error passes through unchanged. `writeFile` failures are the one
// exception, left unmapped, so they keep reporting the user's own `--out` string.
export async function renderCard(html: string, out: string, timeoutMs = 15_000): Promise<void> {
  const lower = out.toLowerCase();
  if (lower.endsWith(".html")) {
    await writeFile(out, html);
    return;
  }
  let bytes: Uint8Array;
  let timer: ReturnType<typeof setTimeout>;
  try {
    bytes = await Promise.race([
      (async () => {
        const view = new Bun.WebView({ width: WIDTH, height: HEIGHT, backend: BACKEND });
        try {
          await view.navigate("data:text/html;charset=utf-8," + encodeURIComponent(html));
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
  await writeFile(out, bytes);
}
