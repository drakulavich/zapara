// Real-format Claude Code 2.1.274 transcript lines. Field names and shapes copied from
// ~/.claude/projects; text is a placeholder. Keep this the only place that knows the shape.
import { mkdir, utimes, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Transcript } from "../../src/types.ts";

let counter = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;

const base = (ts: string, sid: string, extra: Record<string, unknown>) =>
  JSON.stringify({
    parentUuid: null, isSidechain: false, userType: "external", cwd: "/tmp/project",
    sessionId: sid, version: "2.1.274", gitBranch: "main", uuid: uuid(), timestamp: ts, ...extra,
  });

export const prompt = (ts: string, sid: string) =>
  base(ts, sid, { type: "user", message: { role: "user", content: "placeholder prompt" } });

export const promptBlocks = (ts: string, sid: string) =>
  base(ts, sid, { type: "user", message: { role: "user", content: [{ type: "text", text: "placeholder prompt" }] } });

export const meta = (ts: string, sid: string) =>
  base(ts, sid, { type: "user", isMeta: true, message: { role: "user", content: [{ type: "text", text: "<system-reminder>placeholder</system-reminder>" }] } });

export const assistant = (ts: string, sid: string) =>
  base(ts, sid, { type: "assistant", requestId: "req_placeholder", message: { id: "msg_placeholder", role: "assistant", model: "claude-fable-5-1", content: [{ type: "text", text: "placeholder reply" }] } });

export const interrupt = (ts: string, sid: string, forTool = false) =>
  base(ts, sid, { type: "user", message: { role: "user", content: [{ type: "text", text: forTool ? "[Request interrupted by user for tool use]" : "[Request interrupted by user]" }] } });

export const reject = (ts: string, sid: string) =>
  base(ts, sid, { type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_placeholder", is_error: true, content: "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). STOP what you are doing and wait for the user to tell you how to proceed." }] }, toolUseResult: "The user doesn't want to proceed with this tool use." });

export const toolResult = (ts: string, sid: string) =>
  base(ts, sid, { type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_placeholder", is_error: false, content: "ok" }] } });

const toolUse = (ts: string, sid: string, name: string) =>
  base(ts, sid, { type: "assistant", requestId: "req_placeholder", message: { id: "msg_placeholder", role: "assistant", model: "claude-fable-5-1", content: [{ type: "tool_use", id: "toolu_placeholder", name, input: {} }] } });

export const question = (ts: string, sid: string) => toolUse(ts, sid, "AskUserQuestion");
export const plan = (ts: string, sid: string) => toolUse(ts, sid, "ExitPlanMode");

export const mode = (sid: string, m: string) => JSON.stringify({ type: "permission-mode", permissionMode: m, sessionId: sid });

export const sidechain = (ts: string, sid: string) =>
  base(ts, sid, { type: "user", isSidechain: true, agentId: "aa395d63485bb2c77", message: { role: "user", content: "placeholder subagent prompt" } });

export const transcript = (lines: string[], path = "p/s.jsonl"): Transcript => ({ path, text: lines.join("\n") + "\n" });

export async function writeTree(root: string, files: { path: string; lines: string[]; mtime: string }[]): Promise<void> {
  for (const f of files) {
    const full = join(root, f.path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, f.lines.join("\n") + "\n");
    const t = new Date(f.mtime);
    await utimes(full, t, t);
  }
}
