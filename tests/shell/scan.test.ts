import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scan } from "../../src/scan.ts";
import { prompt, writeTree } from "../helpers/transcript.ts";

const S = "11111111-1111-4111-8111-111111111111";
const line = [prompt("2026-09-14T13:00:00.000Z", S)];
let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "zapara-scan-"));
  await writeTree(root, [
    { path: "proj-a/zzz.jsonl", lines: line, mtime: "2026-09-14T13:00:00.000Z" },
    { path: "proj-a/aaa.jsonl", lines: line, mtime: "2026-09-14T13:00:00.000Z" },
    { path: "proj-a/aaa/subagents/agent-1.jsonl", lines: line, mtime: "2026-09-14T13:00:00.000Z" },
    { path: "proj-b/old.jsonl", lines: line, mtime: "2026-09-13T20:59:59.000Z" },   // before cutoff
    { path: "proj-b/edge.jsonl", lines: line, mtime: "2026-09-13T21:00:00.000Z" },  // exactly at cutoff: kept
    { path: "proj-b/notes.txt", lines: ["x"], mtime: "2026-09-14T13:00:00.000Z" },
    { path: "subagents-not-a-dir.jsonl", lines: line, mtime: "2026-09-14T13:00:00.000Z" }, // name contains the word: kept
  ]);
});
afterAll(() => rm(root, { recursive: true, force: true }));

const cutoff = Date.parse("2026-09-13T21:00:00.000Z");

describe("scan", () => {
  test("finds .jsonl recursively, skips subagents directories and old files, sorts", async () => {
    const paths = await scan(root, cutoff);
    expect(paths.map((p) => p.slice(root.length + 1))).toEqual([
      "proj-a/aaa.jsonl", "proj-a/zzz.jsonl", "proj-b/edge.jsonl", "subagents-not-a-dir.jsonl",
    ]);
  });

  test("a missing root is an error", async () => {
    await expect(scan(join(root, "nope"), cutoff)).rejects.toThrow("projects directory not found");
  });

  test("a file that is not a directory as root is an error", async () => {
    await expect(scan(join(root, "proj-b/notes.txt"), cutoff)).rejects.toThrow("projects directory not found");
  });

  test("an unreadable file is still listed: scan only stats, reading happens later in report()", async () => {
    // stat() needs only directory-traversal permission, not read permission on the
    // file itself, so this holds for both a regular user and root — no root guard needed.
    const dir = await mkdtemp(join(tmpdir(), "zapara-scan-unreadable-"));
    const secret = join(dir, "secret.jsonl");
    try {
      await writeTree(dir, [{ path: "secret.jsonl", lines: line, mtime: "2026-09-14T13:00:00.000Z" }]);
      await chmod(secret, 0o000);
      const paths = await scan(dir, cutoff);
      expect(paths).toEqual([secret]);
    } finally {
      await chmod(secret, 0o644).catch(() => {});
      await rm(dir, { recursive: true, force: true });
    }
  });
});
