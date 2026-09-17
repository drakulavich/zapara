import { readFile } from "node:fs/promises";
import { analyze } from "./analyze.ts";
import { windowBounds } from "./derive.ts";
import { scan } from "./scan.ts";
import type { Day, Transcript } from "./types.ts";

export type ReportOptions = { projects: string; to: string; days: number };

// The shell's seam: lists and reads files, then hands the text to the pure core.
export async function report(o: ReportOptions): Promise<Day[]> {
  const window = { to: o.to, days: o.days };
  const paths = await scan(o.projects, windowBounds(window).cutoffMs);
  const transcripts: Transcript[] = [];
  for (const path of paths) {
    try { transcripts.push({ path, text: await readFile(path, "utf8") }); } catch { /* vanished or unreadable: skip */ }
  }
  return analyze(transcripts, window);
}
