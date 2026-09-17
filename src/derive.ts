import { score } from "./score.ts";
import type { Day, Event, HourBucket, Metrics, Totals, Window } from "./types.ts";

export const LOOKBACK_MS = 3 * 60 * 60 * 1000;
export const GAP_MS = 10 * 60 * 1000;
export const SLOT_MS = 5 * 60 * 1000;
const LATE_HOURS = new Set([23, 0, 1, 2, 3, 4, 5]);

const pad2 = (n: number) => String(n).padStart(2, "0");
export const localDate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseDate = (s: string): Date => {
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d); // local midnight
};

export function windowBounds(w: Window): { startMs: number; endMs: number; cutoffMs: number; dates: string[] } {
  const to = parseDate(w.to);
  const dates: string[] = [];
  for (let i = w.days - 1; i >= 0; i--) {
    const d = new Date(to.getFullYear(), to.getMonth(), to.getDate() - i);
    dates.push(localDate(d));
  }
  const startMs = parseDate(dates[0]!).getTime();
  const endMs = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1).getTime();
  return { startMs, endMs, cutoffMs: startMs - LOOKBACK_MS, dates };
}

const emptyMetrics = (): Metrics => ({
  sessions: 0, prompts: 0, reports: 0, outputTokens: 0, interrupts: 0, rejects: 0, questions: 0, plans: 0, modeSwitches: 0,
  decisions: 0, contextSwitches: 0, activeMin: 0, streakMin: 0, lateNight: false,
});

type Acc = { m: Metrics; sessions: Set<string>; slots: Set<number>; lastPromptSession: string | null; lastActivity: { ts: number; streakStart: number } | null };

// Walks the sorted, look-back-filtered events once, keyed by "date|hour",
// tracking the running activity streak (which may start before startMs) and
// accumulating each bucket's raw counts. Events before startMs update the
// streak only; they are never attributed to a bucket.
function foldEvents(sorted: Event[], startMs: number): Map<string, Acc> {
  const acc = new Map<string, Acc>(); // key "date|hour"
  const key = (ts: number): string => {
    const d = new Date(ts);
    return `${localDate(d)}|${d.getHours()}`;
  };
  const get = (k: string): Acc => {
    let a = acc.get(k);
    if (!a) { a = { m: emptyMetrics(), sessions: new Set(), slots: new Set(), lastPromptSession: null, lastActivity: null }; acc.set(k, a); }
    return a;
  };

  let prevActivityTs: number | null = null;
  let streakStart: number | null = null;
  for (const e of sorted) {
    if (e.kind === "activity") {
      streakStart = prevActivityTs === null || e.ts - prevActivityTs > GAP_MS ? e.ts : streakStart;
      prevActivityTs = e.ts;
    }
    if (e.ts < startMs) continue; // look-back: streak bookkeeping only
    const a = get(key(e.ts));
    switch (e.kind) {
      case "activity":
        a.sessions.add(e.sessionId);
        a.slots.add(Math.floor(e.ts / SLOT_MS));
        a.lastActivity = { ts: e.ts, streakStart: streakStart! };
        break;
      case "prompt":
        a.m.prompts++;
        if (a.lastPromptSession !== null && a.lastPromptSession !== e.sessionId) a.m.contextSwitches++;
        a.lastPromptSession = e.sessionId;
        break;
      case "report": a.m.reports++; break;
      case "output": a.m.outputTokens += e.tokens ?? 0; break;
      case "interrupt": a.m.interrupts++; break;
      case "reject": a.m.rejects++; break;
      case "question": a.m.questions++; break;
      case "plan_review": a.m.plans++; break;
      case "mode_change": a.m.modeSwitches++; break;
    }
  }
  return acc;
}

// Builds one Day's 24 hour buckets from the accumulated counts, scores each,
// and rolls up totals, peak and mean.
function buildDay(date: string, acc: Map<string, Acc>): Day {
  const buckets: HourBucket[] = [];
  for (let hour = 0; hour < 24; hour++) {
    const a = acc.get(`${date}|${hour}`);
    const m = a ? a.m : emptyMetrics();
    if (a) {
      m.sessions = a.sessions.size;
      m.activeMin = a.slots.size * 5;
      m.streakMin = a.lastActivity ? Math.round((a.lastActivity.ts - a.lastActivity.streakStart) / 60000) : 0;
    }
    m.decisions = m.interrupts + m.rejects + m.questions + m.plans + m.modeSwitches;
    // lateNight is a property of the hour label, so it is set on every bucket,
    // including empty ones; score() returns null for buckets without
    // sessions, so an empty late hour scores nothing.
    m.lateNight = LATE_HOURS.has(hour);
    buckets.push({ ...m, hour, score: score(m) });
  }
  const scored = buckets.filter((b) => b.score !== null);
  const totals: Totals = buckets.reduce((t, b) => ({
    prompts: t.prompts + b.prompts, reports: t.reports + b.reports, outputTokens: t.outputTokens + b.outputTokens,
    interrupts: t.interrupts + b.interrupts, rejects: t.rejects + b.rejects,
    questions: t.questions + b.questions, plans: t.plans + b.plans, modeSwitches: t.modeSwitches + b.modeSwitches,
    decisions: t.decisions + b.decisions, contextSwitches: t.contextSwitches + b.contextSwitches,
    maxSessions: Math.max(t.maxSessions, b.sessions),
  }), { prompts: 0, reports: 0, outputTokens: 0, interrupts: 0, rejects: 0, questions: 0, plans: 0, modeSwitches: 0, decisions: 0, contextSwitches: 0, maxSessions: 0 });
  return {
    date,
    peak: scored.length ? Math.max(...scored.map((b) => b.score!.index)) : null,
    mean: scored.length ? Math.round(scored.reduce((s, b) => s + b.score!.index, 0) / scored.length) : null,
    activeMin: buckets.reduce((s, b) => s + b.activeMin, 0),
    totals,
    buckets,
  };
}

export function derive(events: Event[], w: Window): Day[] {
  const { startMs, endMs, cutoffMs, dates } = windowBounds(w);
  const sorted = events
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.ts >= cutoffMs && e.ts < endMs)
    .sort((a, b) => a.e.ts - b.e.ts || (a.e.sessionId < b.e.sessionId ? -1 : a.e.sessionId > b.e.sessionId ? 1 : 0) || a.i - b.i)
    .map(({ e }) => e);
  const acc = foldEvents(sorted, startMs);
  return dates.map((date) => buildDay(date, acc));
}
