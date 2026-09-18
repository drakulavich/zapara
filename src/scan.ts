import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

// Lists transcript files worth reading. Subagent transcripts live under a `subagents`
// directory and are the parent agent's conversation, not the human's; a file whose mtime
// is before the cutoff cannot hold events the report needs.
export async function scan(projects: string, cutoffMs: number): Promise<string[]> {
  try {
    if (!(await stat(projects)).isDirectory()) throw new Error("not a directory");
  } catch {
    // No path in the message: it may be a value the user typed, or the
    // homedir-derived default, and the CLI must never print a filesystem path.
    throw new Error("projects directory not found (pass --projects <dir>)");
  }
  const out: string[] = [];
  await walk(projects, cutoffMs, out);
  return out.sort();
}

// One directory at a time, so one unreadable directory or a symlink loop costs only
// that directory. A symlink is not followed into: Claude Code never writes one, and
// following it is how a loop or a stray link to $HOME would get in.
async function walk(dir: string, cutoffMs: number, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "subagents") await walk(full, cutoffMs, out);
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      try {
        if ((await stat(full)).mtimeMs >= cutoffMs) out.push(full);
      } catch {}
    }
  }
}
