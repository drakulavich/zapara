#!/usr/bin/env bun
// Downloads the four web fonts the card embeds from pinned package versions on
// jsDelivr and refuses any byte stream whose SHA-256 is not the pinned one. The
// digests are the contract: to move to a newer font, bump the version, run the
// script, and paste the digests it prints on mismatch after checking them.
// Usage: bun scripts/fetch-fonts.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const FONT_DIR = resolve(import.meta.dir, "..", "assets", "fonts");
const INTER = "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.2.5";
const MONO = "https://cdn.jsdelivr.net/npm/@fontsource/jetbrains-mono@5.2.5";
export const FONTS: readonly { file: string; url: string; sha256: string }[] = [
  { file: "inter-400.woff2", url: `${INTER}/files/inter-latin-400-normal.woff2`, sha256: "dd05e326cf8eac3b55acecf29c842ed73e6e6dd06491cf47f7e8800680ab3e33" },
  { file: "inter-700.woff2", url: `${INTER}/files/inter-latin-700-normal.woff2`, sha256: "aac638f7503cebb084ec494cf00f75f7d8260d50c2f4e7820bccabba09626a3a" },
  { file: "inter-800.woff2", url: `${INTER}/files/inter-latin-800-normal.woff2`, sha256: "e4a6db93190ce6c09e9871496bc63a2b7a59838435e8ec23996afd9619bc3883" },
  { file: "jetbrains-mono-500.woff2", url: `${MONO}/files/jetbrains-mono-latin-500-normal.woff2`, sha256: "cb182feeed4d798ff6961d3c79f7026279448fca0676438aaecb21f3fc39553a" },
  { file: "LICENSE-inter.txt", url: `${INTER}/LICENSE`, sha256: "18aabf190848725e2576eefb5c29ba06aac1029d02132252a7f312eac2e50cf3" },
  { file: "LICENSE-jetbrains-mono.txt", url: `${MONO}/LICENSE`, sha256: "18aabf190848725e2576eefb5c29ba06aac1029d02132252a7f312eac2e50cf3" },
];

export const sha256 = (bytes: Uint8Array): string => new Bun.CryptoHasher("sha256").update(bytes).digest("hex");

async function main(): Promise<void> {
  mkdirSync(FONT_DIR, { recursive: true });
  let failures = 0;
  for (const f of FONTS) {
    const res = await fetch(f.url);
    if (!res.ok) { console.error(`${f.file}: HTTP ${res.status}`); failures++; continue; }
    const bytes = new Uint8Array(await res.arrayBuffer());
    const digest = sha256(bytes);
    if (digest !== f.sha256) { console.error(`${f.file}: sha256 ${digest} is not the pinned ${f.sha256}; not written`); failures++; continue; }
    writeFileSync(join(FONT_DIR, f.file), bytes);
    console.log(`${f.file}: ${bytes.length} bytes, sha256 ok`);
  }
  if (failures > 0) process.exit(1);
}

if (import.meta.main) await main();
