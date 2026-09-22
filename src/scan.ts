import type { Dirent } from "node:fs";
import { open, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

// A `subagents` directory holds the parent agent's conversation, not the human's.
export async function scan(projects: string, cutoffMs: number): Promise<string[]> {
  // No path in either message: the CLI never prints one.
  let root;
  try {
    if (!(await stat(projects)).isDirectory()) throw new Error("not a directory");
    root = await readdir(projects, { withFileTypes: true });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "EACCES" || code === "EPERM") throw new Error("projects directory cannot be read (check its permissions)");
    throw new Error("projects directory not found (pass --projects <dir>)");
  }
  const out: string[] = [];
  await collect(projects, root, cutoffMs, out);
  return out.sort();
}

// One unreadable directory costs only itself. Symlinks are not followed: Claude
// Code never writes one, and following one is how a loop or $HOME would get in.
async function collect(dir: string, entries: Dirent[], cutoffMs: number, out: string[]): Promise<void> {
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "subagents") continue;
      try {
        await collect(full, await readdir(full, { withFileTypes: true }), cutoffMs, out);
      } catch {}
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      try {
        if ((await stat(full)).mtimeMs >= cutoffMs || (await lastTimestampMs(full)) >= cutoffMs) out.push(full);
      } catch {}
    }
  }
}

// mtime can be older than the records inside (sync, restore, clock skew), so for
// a file mtime would drop, the last "timestamp" in its final 64 KB decides. 64 KB
// because the last record is often a big tool result with its timestamp in front.
const TAIL_BYTES = 65_536;
async function lastTimestampMs(path: string): Promise<number> {
  const fh = await open(path, "r");
  try {
    const size = (await fh.stat()).size;
    const start = Math.max(0, size - TAIL_BYTES);
    const buf = Buffer.alloc(size - start);
    await fh.read(buf, 0, buf.length, start);
    const tail = buf.toString("utf8");
    let last = -Infinity;
    for (const m of tail.matchAll(/"timestamp":"([^"]{20,40})"/g)) {
      const ms = Date.parse(m[1]!);
      if (!Number.isNaN(ms)) last = ms;
    }
    return last;
  } finally {
    await fh.close();
  }
}
