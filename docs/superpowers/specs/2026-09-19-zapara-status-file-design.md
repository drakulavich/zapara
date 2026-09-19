# zapara status: one small file for a status line

Extends `2026-09-17-zapara-design.md`. Everything not mentioned here stays as
that spec says.

## Purpose

A status line wants one number from zapara, the load of the hour that is
running now, and it wants it in a few milliseconds, every thirty seconds,
without reading a single transcript. zapara takes about half a second to
compute a day, which is too slow for a status line and far too slow for one
that Claude Code kills and restarts on every event. So zapara writes the
number down, and the status line reads it back.

`zapara status` computes today and writes a one-line JSON file at a fixed
path. Whoever renders a status line reads that file, draws the number, and
decides for itself when the file is old enough to ask for a new one. The base
spec listed a statusline segment under non-goals and promised this cache
file as the later step; this is that step. The consumer in mind is
[pult](https://github.com/drakulavich/pult), but the file is plain JSON at a
plain path, and any status line can read it.

zapara stays a program that runs and exits. This spec adds no hook, no timer,
no daemon and no watcher; refreshing is the reader's job, and the contract
for it is written down below so the two sides agree without sharing code.

Prerequisite: the snapshot change (PR 25, branch `xt-fixes`), which gives
`Window` an optional `now`, `Day` an optional `asOf`, and makes `derive()`
drop events after `now`. This spec reuses that plumbing and adds none of
its own; it cannot be implemented on a `main` that lacks it.

## CLI

```
zapara status [--projects DIR]
```

- Computes the local calendar day that contains `now`, exactly as
  `zapara today` does (same `report()`, same window, same `asOf` rule: events
  after `now` are not counted).
- Writes the status file, then prints the same JSON line to stdout. `--json`
  is accepted and changes nothing, since the output is already JSON.
- The window flags (`--days`, `--from`, `--to`), `--explain` and `--out` are
  usage errors here, worded like the ones for a named day: `--days, --from
  and --to do not apply to status`, `--explain applies to a named day only`,
  `--out applies to card only`.
- Exit 0 after a successful write. A failure to read the projects directory
  is the base spec's one-line error and exit 1; a failure to write the file
  is one line, `cannot write the status file`, exit 1. Neither prints a path.
- Runtime: one day of transcripts, well under a second on a busy machine.

`--help` gains one line in the command list:

```
       zapara status                   write today's load for a status line
```

## The file

Path: `~/.claude/zapara/status.json`, where `~` is the home directory, on
every platform. There is one file per user, whatever `--projects` was; the
file describes the projects directory zapara read, and a reader has no way
to tell which one, so a person who runs `status` against a second directory
overwrites the first. The directory is created on first use.

Content: exactly one line of JSON, no trailing spaces, a newline at the end.

```json
{"schema":1,"asOf":"2026-09-19T12:30:38.300Z","date":"2026-09-19","hour":15,"index":36,"level":"Warming","peak":41,"activeMin":555,"streakMin":166}
```

| Field | Meaning |
|---|---|
| `schema` | The shape of this file: `1`. A reader that sees a number it does not know shows nothing. It changes only when a field changes meaning or goes away; adding a field does not bump it. |
| `asOf` | When the snapshot was taken, ISO 8601 UTC: the `Day.asOf` of the base spec, the `now` of this run. A reader decides staleness from this field, never from the file's mtime. |
| `date` | The local calendar day the numbers describe, `YYYY-MM-DD`. |
| `hour` | The local hour that contains `asOf`, `0`..`23`. |
| `index` | That hour's load index, `0`..`100`, or `null` when the hour has no activity yet. |
| `level` | That hour's level, `Calm`, `Warming`, `Heating` or `Fried`, or `null` with `index`. A reader colours by this field so it never needs the thresholds. |
| `peak` | The day's peak index so far, or `null` on a day with no activity. |
| `activeMin` | Active minutes in the day so far; `0` on a day with no activity. |
| `streakMin` | Minutes of the unbroken streak as of the current hour, `0` when there is none. |

`hour`, `index`, `level` and `streakMin` describe the bucket of the current
hour; `peak` and `activeMin` describe the day. On a day with no activity the
file is still written, with the `null`s and zeros above, so a reader can tell
"nothing yet today" from "zapara never ran".

Privacy: the file holds these nine values and nothing else. No path, no
project, no session count, no text, no token count: a status line has no use
for them and the file may sit in a directory other tools read.

## Writing the file

- The write is atomic: the line goes to a temporary file in the same
  directory, created exclusively (`wx`, so an existing file or symlink at
  that name is an error, never followed) under a name unique to this run,
  `status.json.<pid>.<random>.tmp`, then renamed over `status.json`. A
  reader sees the old file or the new one, never a partial line.
- Two runs at once are allowed and harmless: each writes its own temporary
  file, each rename is atomic, the last rename wins, and both files were
  complete. Nothing locks; a reader's single-flight rule (below) keeps the
  number of concurrent runs small, and zapara does not depend on it.
- The temporary file is removed on every path out of a failed write. One
  left by a crash is not reused: the next run deletes any
  `status.json.*.tmp` in the directory older than ten minutes and never
  opens one.
- The file is created with mode `0600` (owner read and write). The directory
  with `0700`. `status.json` itself may be a symlink someone put there;
  `rename` replaces the link, it does not write through it.
- On any error before the rename, the existing `status.json` is left as it
  was: a status line keeps showing the last good snapshot with its own
  `asOf`, which is the truthful state.
- `$HOME` unset or empty is the write error above; no other location is
  tried.

## Contract for a reader

Written here so pult and zapara agree without either reading the other's
source.

- Read `~/.claude/zapara/status.json` and decode it strictly. The file is
  written by another program and can be replaced by any tool the same user
  runs, so the reader trusts nothing in it: it is one JSON object; `schema`
  is `1`; `asOf` parses as an ISO 8601 instant no later than one minute
  after the reader's own clock; `date` is `YYYY-MM-DD`; `hour` is an integer
  `0`..`23`; `index` and `peak` are `null` or integers `0`..`100`; `level` is
  `null` exactly when `index` is, else one of the four names; `activeMin` and
  `streakMin` are integers `0`..`1440`. Anything else, and a missing or
  unreadable file, is treated as no data: the segment is not drawn, and the
  file counts as stale.
- Draw the current hour's `index`, coloured by `level`; `null` draws nothing.
  Whatever else the reader shows (`peak`, `activeMin` as hours and minutes)
  comes from the same file.
- Staleness is `now - asOf`, or no data at all. When the file is stale, the
  reader runs `zapara status` as a detached process with stdin, stdout and
  stderr closed, does not wait for it, and draws what it has; the next read
  picks up the new file. This is how the file comes to exist on a machine
  that never ran zapara: the first render finds nothing, starts one run, and
  the render after that has the file. The threshold is the reader's (pult's
  is five minutes).
- Single flight: a reader starts at most one run per threshold, whatever the
  file says in between, and never one per render. That bounds a broken file
  (one that fails validation forever) to one run per threshold, and it keeps
  the half-second cost and Claude Code's "kill the in-flight script" rule
  away from the status line, which is what this file exists for. How the
  reader remembers its last launch is its own business (pult: a marker file
  beside the status file, or the launch time in its own cache).
- `asOf` moves only when zapara actually ran, so a reader that shows the
  snapshot's age shows the truth.
- `zapara` is found on the reader's `PATH`; a reader with a
  `bun`-locating wrapper (pult's) can fall back to `bunx @drakulavich/zapara
  status`. When neither is found the reader shows the file it has, or
  nothing, and never an error.

## Architecture

- `src/statusfile.ts` is a new shell module. It is the second file, after
  `src/image.ts`, allowed to write a file, and the only one allowed to write
  the status file; CLAUDE.md's shell rule names it. It owns the path
  (`join(homedir(), ".claude", "zapara", "status.json")`), `mkdir`, the
  temporary file, `rename`, and the modes. It exports one function,
  `writeStatus(line: string): Promise<void>`.
- `src/status.ts` is core: `statusOf(day: Day, now: Date): Status` builds
  the object from the `Day` that `report()` returned, using `now` only for
  `hour`; `renderStatus(s: Status): string` is `JSON.stringify` in the field
  order above plus the newline. Neither touches the clock or the file
  system. `Status` is the type of the table above.
- `src/index.ts`: `status` is a fourth command beside `grid`, `day` and
  `card`; it takes the day path's window (`to = localDate(now)`, `days = 1`),
  calls `report()`, then `statusOf`, `renderStatus`, `writeStatus`, and prints
  the line. The `asOf`/`now` plumbing from the snapshot change is reused
  unchanged.
- Nothing else changes: `analyze()`, the grid, the day, the card and the
  JSON they print are untouched.

## Testing

Fixture-driven through the public seams, as the base spec requires:

- `tests/analyze/status.test.ts`: `analyze()` on a transcript with activity
  in two hours of 2026-09-14, then `statusOf(days[0], now)` with `now` inside
  the second hour: every field asserted to its exact value (`hour`, `index`,
  `level`, `peak`, `activeMin`, `streakMin`, `date`, `asOf`, `schema`). The
  same with `now` in an hour with no activity: `index` and `level` `null`,
  `peak` and `activeMin` still the day's. An empty transcript list: the
  all-`null`/zero shape. `renderStatus` on one of them: the exact line, one
  newline, field order as in the table. Each assertion fails under a
  one-line mutation (a wrong bucket picked, a field dropped, the newline
  lost).
- `tests/shell/status-cli.test.ts`: the CLI with `HOME` pointing at a temp
  directory and `--projects` at a fixture tree with activity today
  (`utcDay(0)`): exit 0, stdout is one JSON line equal to the file's content,
  the file exists at `<HOME>/.claude/zapara/status.json` with mode `0600`,
  the directory with `0700`, no `status.json.tmp` beside it, and `asOf`
  matches the ISO shape. A second run with an unreadable projects directory:
  exit 1, one line on stderr, no path in it, and the file's content is
  byte-identical to before. `--days 3` with `status`: exit 2 and the usage
  message. `HOME` empty: exit 1, `cannot write the status file`. Four runs started at once against the same
  `HOME`: all exit 0, the file is one complete line, no `*.tmp` remains. A
  stale `status.json.1.abc.tmp` older than ten minutes (mtime set by the
  test) is gone after a run, a fresh one is left alone. `status.json`
  replaced by a symlink to another file in the temp directory: after a run
  the path is a regular file and the link's target is unchanged.
- The README's `--help` test (existing) pins the new help line and the
  80-column width.

## README, CHANGELOG, CLAUDE.md

- README: one row in the usage table (`zapara status`, "write today's load
  for a status line") and a short section "Status line" with the file path,
  the field table, the reader contract in three sentences, and a link to
  pult as the reader that exists. The Limits bullet on the snapshot points
  here.
- CHANGELOG `## [Unreleased]`, `### Added`: "`zapara status` writes today's
  load to `~/.claude/zapara/status.json` for a status line to read; the file
  format and the reader's refresh contract are in the spec."
- CLAUDE.md shell rule: `src/statusfile.ts` joins `src/image.ts` as a file
  writer, for the status file only.

## Later

Not in this change: a status file for a window longer than today, a
configurable path or threshold, a `--watch` mode, a launchd or systemd unit,
and the pult side itself (a segment reading this file), which lives in pult's
repository.
