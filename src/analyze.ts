import { derive } from "./derive.ts";
import { parseTranscript } from "./parse.ts";
import type { Day, Transcript, Window } from "./types.ts";

// Sorted by path so file discovery order cannot change a result.
export function analyze(transcripts: Transcript[], w: Window): Day[] {
  const events = [...transcripts]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .flatMap((t) => parseTranscript(t.text));
  return derive(events, w);
}
