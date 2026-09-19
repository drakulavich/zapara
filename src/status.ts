import type { Day, Level } from "./types.ts";

// The status file's content, as data: today's load reduced to the nine values a
// status line needs. Core, not shell — this file never reads the clock, the
// environment or the file system, and never writes one; `now` arrives as an
// argument and `src/statusfile.ts` does the writing. The field order below is
// the file format (see the status-file design spec) and JSON.stringify keeps it.
export type Status = {
  schema: 1;
  asOf: string;
  date: string;
  hour: number;
  index: number | null;
  level: Level | null;
  peak: number | null;
  activeMin: number;
  streakMin: number;
};

// `hour` is the local hour containing `now`; index, level and streakMin describe
// that hour's bucket, peak and activeMin the whole day. A day the report did not
// mark as open has no asOf, so `now` stands in and the function stays total.
export function statusOf(day: Day, now: Date): Status {
  const hour = now.getHours();
  const bucket = day.buckets[hour];
  return {
    schema: 1,
    asOf: day.asOf ?? now.toISOString(),
    date: day.date,
    hour,
    index: bucket?.score?.index ?? null,
    level: bucket?.score?.level ?? null,
    peak: day.peak,
    activeMin: day.activeMin,
    streakMin: bucket?.streakMin ?? 0,
  };
}

// One line of JSON, the fields in the order declared above, newline at the end.
export function renderStatus(s: Status): string {
  return JSON.stringify(s) + "\n";
}
