import type { Event } from "./types.ts";

// Markers compared against message text. The text itself is never kept.
const INTERRUPT_PREFIX = "[Request interrupted by user";
const REJECT_PREFIX = "The user doesn't want to proceed with this tool use";
const QUESTION_TOOL = "AskUserQuestion";
const PLAN_TOOL = "ExitPlanMode";

type Rec = Record<string, unknown>;
const isObj = (v: unknown): v is Rec => typeof v === "object" && v !== null;
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

const firstText = (content: unknown): string | null => {
  if (typeof content === "string") return content;
  if (Array.isArray(content) && isObj(content[0]) && content[0].type === "text") return str(content[0].text);
  return null;
};

export function parseTranscript(text: string): Event[] {
  const events: Event[] = [];
  let lastTs: number | null = null;
  let lastMode: string | null = null;

  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    let rec: unknown;
    try { rec = JSON.parse(line); } catch { continue; }
    if (!isObj(rec)) continue;
    const type = str(rec.type);
    const sessionId = str(rec.sessionId);
    if (type === null || sessionId === null) continue;
    if (rec.isSidechain === true) continue;

    if (type === "permission-mode") {
      const m = str(rec.permissionMode);
      if (m === null) continue;
      // The baseline mode is tracked as soon as it is seen, even before any
      // timestamp exists, so a later switch away from it can be detected. A
      // switch is only ever emitted as an event once a timestamp is known;
      // a switch that happens before any timestamp is known is dropped.
      if (lastMode !== null && m !== lastMode && lastTs !== null) {
        events.push({ ts: lastTs, sessionId, kind: "mode_change" });
      }
      lastMode = m;
      continue;
    }

    if (type !== "user" && type !== "assistant") continue;
    const ts = Date.parse(str(rec.timestamp) ?? "");
    if (Number.isNaN(ts)) continue;
    lastTs = ts;
    events.push({ ts, sessionId, kind: "activity" });

    const content = isObj(rec.message) ? rec.message.content : undefined;
    if (type === "user") {
      const blocks = Array.isArray(content) ? content : [];
      for (const b of blocks) {
        if (!isObj(b) || b.type !== "tool_result") continue;
        const t = firstText(b.content);
        if (t !== null && t.startsWith(REJECT_PREFIX)) events.push({ ts, sessionId, kind: "reject" });
      }
      const head = firstText(content);
      if (head === null) continue;
      if (head.startsWith(INTERRUPT_PREFIX)) events.push({ ts, sessionId, kind: "interrupt" });
      else if (rec.isMeta !== true) events.push({ ts, sessionId, kind: "prompt" });
    } else {
      const blocks = Array.isArray(content) ? content : [];
      for (const b of blocks) {
        if (!isObj(b) || b.type !== "tool_use") continue;
        if (b.name === QUESTION_TOOL) events.push({ ts, sessionId, kind: "question" });
        else if (b.name === PLAN_TOOL) events.push({ ts, sessionId, kind: "plan_review" });
      }
    }
  }
  return events;
}
