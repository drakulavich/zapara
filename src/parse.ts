import type { Event } from "./types.ts";

// Markers compared against message text. The text itself is never kept.
const INTERRUPT_PREFIX = "[Request interrupted by user";
const REJECT_PREFIX = "The user doesn't want to proceed with this tool use";
const QUESTION_TOOL = "AskUserQuestion";
const PLAN_TOOL = "ExitPlanMode";
// Inbound messages from subagents, other sessions and background tasks: the human
// has to read and react to these, but did not type them, so they are `report`
// events, never `prompt`. An interrupt marker is checked first and always wins.
const AGENT_MARKERS = [
  "Another Claude session sent a message:",
  "<teammate-message",
  "<cross-session-message",
  "<task-notification>",
  "[Cross-session",
];

type Rec = Record<string, unknown>;
const isObj = (v: unknown): v is Rec => typeof v === "object" && v !== null;
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

// The text a marker is compared against: the content itself when it is a string,
// otherwise the first `{type:"text"}` block anywhere in the array. A pasted
// screenshot puts an `image` block in front of what the person typed, so the
// text is not always the first block.
const firstText = (content: unknown): string | null => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;
  for (const b of content) if (isObj(b) && b.type === "text") return str(b.text);
  return null;
};

export function parseTranscript(text: string): Event[] {
  const events: Event[] = [];
  let lastTs: number | null = null;
  let lastMode: string | null = null;
  // Mode switches seen before this file's first timestamped record, waiting for
  // a time to belong to.
  let pendingModeChanges = 0;
  // Dedupes `output` events by requestId within this one file: Claude Code
  // writes one record per content block of a response, repeating the same
  // requestId and usage, so only the first qualifying record counts.
  const seenRequestIds = new Set<string>();
  // `tool_use` ids of the two tools whose result the human writes: the option
  // they picked, or their verdict on a plan. Every other `tool_result` is the
  // machine reporting back, so the pairing is what tells the two apart.
  const askedIds = new Set<string>();

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
      // switch before any timestamp waits: switching the mode before typing
      // anything is how a session often starts, and it is attributed to the
      // first timestamped record that follows. A file with none drops them.
      if (lastMode !== null && m !== lastMode) {
        if (lastTs === null) pendingModeChanges++;
        else events.push({ ts: lastTs, sessionId, kind: "mode_change" });
      }
      lastMode = m;
      continue;
    }

    if (type !== "user" && type !== "assistant") continue;
    const ts = Date.parse(str(rec.timestamp) ?? "");
    if (Number.isNaN(ts)) continue;
    lastTs = ts;
    events.push({ ts, sessionId, kind: "activity" });
    for (; pendingModeChanges > 0; pendingModeChanges--) events.push({ ts, sessionId, kind: "mode_change" });

    const content = isObj(rec.message) ? rec.message.content : undefined;
    if (type === "user") {
      const blocks = Array.isArray(content) ? content : [];
      for (const b of blocks) {
        if (!isObj(b) || b.type !== "tool_result") continue;
        const t = firstText(b.content);
        if (t !== null && t.startsWith(REJECT_PREFIX)) events.push({ ts, sessionId, kind: "reject" });
        const toolUseId = str(b.tool_use_id);
        if (toolUseId !== null && askedIds.has(toolUseId)) events.push({ ts, sessionId, kind: "answer" });
      }
      const head = firstText(content);
      if (head === null) continue;
      if (head.startsWith(INTERRUPT_PREFIX)) events.push({ ts, sessionId, kind: "interrupt" });
      else if (rec.isMeta !== true) {
        if (AGENT_MARKERS.some((marker) => head.startsWith(marker))) events.push({ ts, sessionId, kind: "report" });
        else events.push({ ts, sessionId, kind: "prompt" });
      }
    } else {
      const blocks = Array.isArray(content) ? content : [];
      for (const b of blocks) {
        if (!isObj(b) || b.type !== "tool_use") continue;
        if (b.name !== QUESTION_TOOL && b.name !== PLAN_TOOL) continue;
        events.push({ ts, sessionId, kind: b.name === QUESTION_TOOL ? "question" : "plan_review" });
        const id = str(b.id);
        if (id !== null) askedIds.add(id);
      }
      // `output`: one event per distinct requestId per file, the first record seen
      // that has a string requestId, numeric usage.output_tokens and at least one
      // text block. A response holding only tool_use blocks is not text the human
      // reads, so it never triggers this, even on its first (and only) record.
      // A count only counts when it is one a token count can be: a finite
      // non-negative integer. `1e309` parses to Infinity and a negative count
      // to -Infinity, and a day holding both summed to NaN; such a record is
      // still `activity`, it just carries no tokens.
      const requestId = str(rec.requestId);
      const usage = isObj(rec.message) ? rec.message.usage : undefined;
      const outputTokens = isObj(usage) ? usage.output_tokens : undefined;
      const tokens = typeof outputTokens === "number" && Number.isSafeInteger(outputTokens) && outputTokens >= 0 ? outputTokens : null;
      const hasText = blocks.some((b) => isObj(b) && b.type === "text");
      if (requestId !== null && tokens !== null && hasText && !seenRequestIds.has(requestId)) {
        seenRequestIds.add(requestId);
        events.push({ ts, sessionId, kind: "output", tokens });
      }
    }
  }
  return events;
}
