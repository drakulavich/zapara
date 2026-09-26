# zapara cache: parse each transcript once

Extends `2026-09-17-zapara-design.md`. Everything not mentioned here stays as
that spec says.

## Purpose

A 14-day card on a busy machine reads 816 transcripts, 1.6 GB, and parses
about 1 GB of it. With a warm disk cache that is 0.5 s of reading and 2.3 s of
`JSON.parse` on every run, although between two runs only the transcripts of
the sessions still open have changed: 8 files in the last day, against 816 in
the window. `derive` takes 21 ms. The time goes into parsing text that was
parsed the run before.

zapara keeps the events it parsed from each transcript in one SQLite file and
parses a transcript again only when the file has changed. Every command uses
the same cache: `card` and the grid on demand, and `status` each time a status
line finds its file stale.

The cache changes how fast a run is and nothing else. A run with the cache,
a run without it and a run with a broken cache print the same bytes.

## What is stored

One SQLite database, `~/.claude/zapara/cache.db`, opened with `bun:sqlite`
(built into Bun, so the rule of no runtime dependencies holds). `~` is `HOME`
from the environment, as for the status file: an empty `HOME` means no cache,
not a fallback path. The directory is created 0700 and the database 0600, with
the umask set first, as `writeStatus` does. WAL mode leaves `cache.db-wal` and
`cache.db-shm` beside it.

One table, one row per transcript:

| column | holds |
|---|---|
| `key` | SHA-256 of the transcript's absolute path, hex; primary key |
| `size` | byte length of the text that was parsed |
| `mtime_ms` | the file's mtime, taken before it was read |
| `from_ms` | the cutoff the text was parsed with |
| `parser` | the parser version (below) |
| `used_at` | when a run last read or wrote the row, epoch ms |
| `events` | the parsed events as one JSON value (below) |

`events` is `{ "sessions": [id, …], "events": [[ts, kind, sessionIndex, tokens?], …] }`,
where `kind` is the event kind's name and `tokens` appears only on `output`
events. It holds what `parseTranscript` returned, in order, and nothing else.

`parser` is the SHA-256 of `src/parse.ts` read from disk at start-up, plus the
package version. Any edit to the parser, or a release, makes every row stale
without anyone having to remember a version bump.

## A run with the cache

For each file `scan` returns, `report()`:

1. takes its size and mtime (the `stat` that `scan` already does);
2. looks the key up; the row is a hit when `size`, `mtime_ms` and `parser`
   match and `from_ms` is not later than this run's cutoff, since events
   parsed from an earlier cutoff hold every event a later one needs;
3. on a hit, uses the stored events and does not open the file;
4. on a miss, reads the file, calls `parseTranscript(text, cutoff)`, and
   writes the row with the length of the text it read and the mtime from
   step 1.

All lookups are one `SELECT … WHERE key IN (…)`; all writes and the `used_at`
updates go in one transaction at the end of the run. The events from hits
and misses then go to the core in the file order `scan` gave, so the result
cannot depend on which files hit.

A transcript still being written can grow between the `stat` and the read.
The row then stores the longer length with the older mtime, and the next run
misses on the newer mtime and parses again. Nothing is lost; the cost is one
extra parse.

Housekeeping, in the same transaction: rows whose `parser` differs from the
current one are deleted, and so are rows with `used_at` older than 90 days,
the widest window zapara accepts.

## The core

`analyze(transcripts, window)` stays as it is, for the tests that feed it
text. It becomes `parseTranscript` over each transcript followed by a new
export, `analyzeEvents(events, window) → Day[]`, which is `derive` over events
that were parsed already. Both stay pure; the cache lives entirely in the shell.

## Failure

The cache is never a reason for a run to fail or to change its answer.

- The database cannot be opened, is locked past a 2 s `busy_timeout`, or
  fails a query: the run parses every file as it does today and writes
  nothing to the cache.
- The file is not a database or is corrupt: it is deleted along with its
  WAL files and created again, once; if that fails too, the run goes on
  without a cache.
- A row whose `events` does not parse or does not have the shape above is a
  miss.
- No cache error is printed, and none reaches the exit code.

## CLI

- `--no-cache` runs without reading or writing the cache, for any command.
  `--help` gains the line `--no-cache        parse every transcript again`.
- `--verbose` gains one line after `read`:
  `cache   810 hits, 6 misses` (or `cache   off` with `--no-cache` or when
  the cache could not be opened).
- On a miss the `read` line counts only the files that were read.

## Privacy

The base contract forbids keeping a file path. The cache keeps a SHA-256 of
the path as a lookup key, never the path. Events carry what they carry today:
timestamps, session ids, kinds and token counts. No message text, prompt
length or title is stored. The base spec's privacy paragraph gains one
sentence saying so, in this change.

## Project rules this changes

`CLAUDE.md` and the base spec's architecture section:

- `src/cache.ts` joins the shell. It is the only module that uses
  `bun:sqlite`, reads `src/parse.ts` for the parser version, or writes the
  cache; `src/image.ts` and `src/statusfile.ts` keep their own rules.
- The list of modules allowed to write a file becomes three:
  `image.ts` (the card), `statusfile.ts` (the status file), `cache.ts`
  (the cache).

## Testing

CLI tests over fixture project trees in the real transcript format, with
`HOME` pointing at a temporary directory so no test touches the real cache.
Existing CLI tests get the same `HOME`, or they would start writing to it.

- A second run prints the same bytes as the first and as a `--no-cache` run,
  and its `--verbose` line reports hits for every file.
- A line appended to one transcript changes the output, and that file is the
  one miss.
- A run over a wider window than the cached one prints what `--no-cache`
  prints.
- A cache row with garbage in `events`, and a `cache.db` that is plain text,
  each give the `--no-cache` output and exit 0.
- An unwritable `~/.claude/zapara` gives the `--no-cache` output and exit 0.
- The cache files contain neither the fixture's paths nor any of its message
  text.

Mutation to check the tests: a hit that ignores `size` must fail the appended
line test.

Performance target: a warm `zapara card --json` on this machine, with no
transcript changed since the last run, under 1 second.

## Later

A transcript that only grew could be read from where the last run stopped,
with the parser's state (`lastTs`, `lastMode`, the request and question ids)
saved beside the row. That would make the open sessions free as well. It waits
until the whole-file cache shows how much time is left in those files.
