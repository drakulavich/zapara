#!/usr/bin/env bun
// zapara CLI. Argument parsing and output live here; everything else is pure.
import { readFileSync } from "node:fs";

const VERSION = (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }).version;

if (process.argv.includes("--version")) {
  console.log(VERSION);
  process.exit(0);
}
console.error("zapara: not implemented yet");
process.exit(1);
