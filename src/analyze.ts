import { compareStrings, derive, windowBounds } from "./derive.ts";
import { parseTranscript } from "./parse.ts";
import type { Day, Transcript, Window } from "./types.ts";

// Sorted by path so file discovery order cannot change a result.
export function analyze(transcripts: Transcript[], w: Window): Day[] {
  const { cutoffMs } = windowBounds(w);
  const events = [...transcripts]
    .sort((a, b) => compareStrings(a.path, b.path))
    .flatMap((t) => parseTranscript(t.text, cutoffMs));
  return derive(events, w);
}
