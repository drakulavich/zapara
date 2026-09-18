#!/usr/bin/env bun
// Builds the sandbox the README screencast is recorded in: a directory holding a
// `bin/zapara` that runs this checkout against `tests/fixtures/busy-week` and nothing
// else. Every number on screen therefore comes from the synthetic fixture, never from
// a real transcript, which is what makes the recording publishable. The full recipe,
// including the WebP step and the budgets, is in the header of assets/demo.tape. Usage:
//
//   bun scripts/demo-fixture.ts            # a fresh directory under the system temp dir
//   bun scripts/demo-fixture.ts <dir>      # a directory of your choosing; see below
//   DIR=$(bun scripts/demo-fixture.ts) && PATH="$DIR/bin:$PATH" TZ=UTC vhs assets/demo.tape
//
// <dir> must not exist yet. The script never deletes anything: a typo such as $HOME must
// not be wiped, and no marker file could make that safe, since a marker can be planted.
//
// The only thing printed on stdout is the directory, so the line above can capture it.
import { chmodSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Double-quoted for bash, so a path with spaces still runs; the four characters that
// keep their meaning inside double quotes are escaped.
const shellQuote = (s: string) => `"${s.replace(/[\\$"`]/g, (c) => `\\${c}`)}"`;

const root = resolve(import.meta.dir, "..");

let dir: string;
if (process.argv[2] === undefined) {
  dir = mkdtempSync(join(tmpdir(), "zapara-demo-"));
} else {
  dir = resolve(process.argv[2]);
  if (existsSync(dir)) {
    console.error(`refusing to touch ${dir}: it already exists. Pick a new directory, or run without an argument.`);
    process.exit(1);
  }
  mkdirSync(dir, { recursive: true });
}
mkdirSync(join(dir, "bin"), { recursive: true });

// The trailing --projects wins whatever the tape types, and the CLI accepts flags in any
// position, so `zapara day 2026-09-14 --explain` in the recording reads the fixture.
const wrapper = `#!/bin/bash\nexec bun ${shellQuote(join(root, "src", "index.ts"))} "$@" --projects ${shellQuote(join(root, "tests", "fixtures", "busy-week"))}\n`;
writeFileSync(join(dir, "bin", "zapara"), wrapper);
chmodSync(join(dir, "bin", "zapara"), 0o755);

console.log(dir);
