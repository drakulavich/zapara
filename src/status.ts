import { GAP_MS } from "./derive.ts";
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

// `hour` is the local hour containing `now`; index and level describe the
// sixty minutes ending at `now` (the day's `live` bucket), peak and activeMin
// the whole day, and streakMin the streak the person is in right now. A day
// the report did not mark as open has no asOf and no live bucket, so `now`
// stands in and the index is null, and the function stays total.
//
// The live bucket, not the hour's: the hour's bucket holds thirty seconds at
// half past the hour's first minute, and its counts climb all hour, so a
// status line drawn from it saws from nothing to the hour's number and back.
//
// The live streak, not the bucket's: a status line answers "how long have I
// been at this?", and the bucket's number drops to zero at every hour boundary
// and stops growing between two actions. While the last action is no more than
// GAP_MS behind `now`, the streak runs from its first action to `now`; once the
// break is longer than that, it is over and reads 0.
export function statusOf(day: Day, now: Date): Status {
  const hour = now.getHours();
  const live = day.presence !== null && now.getTime() - Date.parse(day.presence.lastAt) <= GAP_MS;
  return {
    schema: 1,
    asOf: day.asOf ?? now.toISOString(),
    date: day.date,
    hour,
    index: day.live?.score?.index ?? null,
    level: day.live?.score?.level ?? null,
    peak: day.peak,
    activeMin: day.activeMin,
    streakMin: live ? Math.round((now.getTime() - Date.parse(day.presence!.streakStartAt)) / 60000) : 0,
  };
}

// One line of JSON, the fields in the order declared above, newline at the end.
export function renderStatus(s: Status): string {
  return JSON.stringify(s) + "\n";
}
