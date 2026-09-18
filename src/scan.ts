import type { Dirent } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

// Lists transcript files worth reading. Subagent transcripts live under a `subagents`
// directory and are the parent agent's conversation, not the human's; a file whose mtime
// is before the cutoff cannot hold events the report needs.
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
        if ((await stat(full)).mtimeMs >= cutoffMs) out.push(full);
      } catch {}
    }
  }
}
