import { readdir, stat } from "node:fs/promises";
import { join, sep } from "node:path";

// Lists transcript files worth reading. Subagent transcripts live under a `subagents`
// directory and are the parent agent's conversation, not the human's; a file whose mtime
// is before the cutoff cannot hold events the report needs.
export async function scan(projects: string, cutoffMs: number): Promise<string[]> {
  let entries: string[];
  try {
    const s = await stat(projects);
    if (!s.isDirectory()) throw new Error("not a directory");
    entries = await readdir(projects, { recursive: true });
  } catch {
    throw new Error(`projects directory not found: ${projects}`);
  }
  const out: string[] = [];
  for (const rel of entries) {
    if (!rel.endsWith(".jsonl")) continue;
    if (rel.split(sep).includes("subagents")) continue;
    const full = join(projects, rel);
    try {
      const s = await stat(full);
      if (!s.isFile() || s.mtimeMs < cutoffMs) continue;
    } catch { continue; }
    out.push(full);
  }
  return out.sort();
}
