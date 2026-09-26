import { readFile } from "node:fs/promises";
import { analyze } from "./analyze.ts";
import { windowBounds } from "./derive.ts";
import { scan, type ScanStats } from "./scan.ts";
import type { Day, Transcript } from "./types.ts";

export type ReportOptions = { projects: string; to: string; days: number; now?: Date };
// What --verbose prints about a run: counts and milliseconds, never a path.
export type Timing = ScanStats & { inWindow: number; read: number; bytes: number; scanMs: number; readMs: number; analyzeMs: number; render?: { format: string; ms: number } };

// Reading one file at a time left the disk idle between files: 1.6 GB took 5.4 s
// sequentially and 0.9 s in parallel. The cap keeps open files well under the limit.
export const READERS = 16;

export async function report(o: ReportOptions, timing?: Timing): Promise<Day[]> {
  const window = { to: o.to, days: o.days, now: o.now };
  const stats: ScanStats = { files: 0, tailChecks: 0 };
  let t = performance.now();
  const paths = await scan(o.projects, windowBounds(window).cutoffMs, stats);
  const scanMs = performance.now() - t;
  t = performance.now();
  const texts: (string | null)[] = new Array(paths.length).fill(null);
  let next = 0;
  let bytes = 0;
  const reader = async (): Promise<void> => {
    while (next < paths.length) {
      const i = next++;
      try {
        const buf = await readFile(paths[i]!);
        bytes += buf.length;
        texts[i] = buf.toString("utf8");
      } catch { /* vanished or unreadable: skip */ }
    }
  };
  await Promise.all(Array.from({ length: Math.min(READERS, paths.length) }, reader));
  const readMs = performance.now() - t;
  const transcripts: Transcript[] = [];
  paths.forEach((path, i) => { if (texts[i] !== null) transcripts.push({ path, text: texts[i]! }); });
  t = performance.now();
  const days = analyze(transcripts, window);
  if (timing) Object.assign(timing, { ...stats, inWindow: paths.length, read: transcripts.length, bytes, scanMs, readMs, analyzeMs: performance.now() - t });
  return days;
}
