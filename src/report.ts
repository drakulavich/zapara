import { readFile } from "node:fs/promises";
import { analyze } from "./analyze.ts";
import { windowBounds } from "./derive.ts";
import { scan } from "./scan.ts";
import type { Day, Transcript } from "./types.ts";

export type ReportOptions = { projects: string; to: string; days: number; now?: Date };

// Reading one file at a time left the disk idle between files: 1.6 GB took 5.4 s
// sequentially and 0.9 s in parallel. The cap keeps open files well under the limit.
const READERS = 16;

export async function report(o: ReportOptions): Promise<Day[]> {
  const window = { to: o.to, days: o.days, now: o.now };
  const paths = await scan(o.projects, windowBounds(window).cutoffMs);
  const texts: (string | null)[] = new Array(paths.length).fill(null);
  let next = 0;
  const reader = async (): Promise<void> => {
    while (next < paths.length) {
      const i = next++;
      try { texts[i] = await readFile(paths[i]!, "utf8"); } catch { /* vanished or unreadable: skip */ }
    }
  };
  await Promise.all(Array.from({ length: Math.min(READERS, paths.length) }, reader));
  const transcripts: Transcript[] = [];
  paths.forEach((path, i) => { if (texts[i] !== null) transcripts.push({ path, text: texts[i]! }); });
  return analyze(transcripts, window);
}
