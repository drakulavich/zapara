import type { Dirent } from "node:fs";
import { open, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

// Lists transcript files worth reading. Subagent transcripts live under a `subagents`
// directory and are the parent agent's conversation, not the human's; mtime is checked
// first, and for a file mtime would drop, the last timestamp in its tail decides.
export async function scan(projects: string, cutoffMs: number): Promise<string[]> {
  // No path in either message: it may be a value the user typed, or the
  // homedir-derived default, and the CLI must never print a filesystem path.
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

// One directory at a time, so one unreadable directory or a symlink loop below the
// root costs only that directory. A symlink is not followed into: Claude Code never
// writes one, and following it is how a loop or a stray link to $HOME would get in.
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

// mtime is a hint, not the truth: a transcript synced from another machine, restored by a
// tool that rewrites times, or written under clock skew can be older by mtime than the
// records inside it. For a file mtime would drop, the last "timestamp" in its final 64 KB
// decides. 64 KB, not a few, because the last record of a conversation is often a big tool
// result (a file read, grep output) and its own timestamp field sits in front of all that
// text. The tail is matched for that one field and discarded; nothing else is read.
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
