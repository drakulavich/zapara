// The card's shell: the only module that reads the card assets, opens a
// Bun.WebView or a Bun.Image, and writes a file. renderCard arrives in the next task.
import { readFile } from "node:fs/promises";
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
  if (parts.length !== 5 || parts.some((p) => p.length === 0)) throw new Error("assets missing: reinstall zapara");
  return { fonts: { inter400: inter400!, inter700: inter700!, inter800: inter800!, mono500: mono500! }, characters: characters! };
}
