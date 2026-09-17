# zapara: cognitive load index from Claude Code transcripts

Date: 2026-09-17. Status: approved design for the MVP.

## Purpose

`zapara` reads the transcripts Claude Code already writes under `~/.claude/projects`
and turns them into an hourly Cognitive Load Index (0–100) for the person driving
the sessions. The MVP has one job: show a week of history as a picture that a human
can check against their own memory, so the formula can be judged and calibrated.
Nothing is installed into Claude Code and nothing leaves the machine.

Privacy contract: the parser compares message text against three fixed control
markers (interrupt, tool rejection, and the two tool names below) and discards it.
No message text, prompt length, file path from a tool call, or session title is
kept in an event, written anywhere, or printed. The output contains only
timestamps, session ids, counts and the derived numbers. The CLI never prints
a filesystem path it derived or read, including the projects root; usage
errors may echo the offending argv token.

Non-goals for the MVP: real-time alerts, break nudges, hooks, OpenTelemetry, a
statusline segment, an HTML dashboard, a config file for weights. The statusline
integration is planned as a later step where `zapara` writes a small cache file
that [pult](https://github.com/drakulavich/pult) reads, so pult keeps its
one-subprocess budget.

## Data source

Root: `~/.claude/projects` (override with `--projects <dir>`, used by tests).
Layout that matters:

```
<projects>/<project-slug>/<session-id>.jsonl                 # one main transcript per session
<projects>/<project-slug>/<session-id>/subagents/agent-*.jsonl   # subagent transcripts
```

Scan rules:

- Take every `*.jsonl` whose path does not contain a `subagents/` directory.
  Subagent files carry the parent's `sessionId`, every record is `isSidechain: true`,
  and their "user" messages are the parent agent's prompts, not the human's.
- Skip a file whose mtime is earlier than `windowStart - LOOKBACK` where
  `LOOKBACK` is 3 hours. A file modified before that cannot contain events the
  report needs (see the streak look-back below). This keeps a week view from
  parsing thousands of old files.
- Return paths sorted lexicographically, so the same tree always yields the same
  file order.
- A file that cannot be read (permissions, vanished between listing and reading)
  is skipped. A missing or unreadable projects root is an error (exit 1).
- Read line by line. A line that is not valid JSON, or has no `type`, is skipped.
  A bad line never aborts the file or the report.

## Events

The parser turns records into a flat list of events. Each event has `ts`
(epoch ms from `timestamp`), `sessionId`, and a `kind`. Records without a
`timestamp` are handled per kind below. Records with `isSidechain: true` are
ignored for every kind (defensive; the scan already skips subagent files).

| kind | rule |
|---|---|
| `prompt` | `type == "user"`, `isMeta` not true, and the message content is a string, or an array whose first block is `{type:"text"}` whose text is not an interrupt marker. |
| `interrupt` | `type == "user"`, content array with a text block whose text starts with `[Request interrupted by user`. Covers both `[Request interrupted by user]` and `[Request interrupted by user for tool use]`. Not counted as a prompt. |
| `reject` | `type == "user"`, content array containing a `tool_result` block whose content (string, or first text block) starts with `The user doesn't want to proceed with this tool use`. |
| `question` | `type == "assistant"`, content array containing a `tool_use` block with `name == "AskUserQuestion"`. One event per block. |
| `plan_review` | Same as `question` with `name == "ExitPlanMode"`. |
| `mode_change` | `type == "permission-mode"`. Has no timestamp: it takes the `ts` of the last timestamped record seen earlier in the same file. If none has been seen yet, the record is dropped. The first such record in a file sets the session's baseline mode and is not a switch (every session writes its starting mode). Each later record whose `permissionMode` differs from the previous record's is one switch; repeats of the same mode count nothing (Claude Code rewrites the same mode repeatedly). |
| `activity` | Every `type == "user"` or `type == "assistant"` record with a timestamp, including `isMeta` ones. Used for session liveness, streaks and active minutes. |

`prompt`, `interrupt` and `reject` records are also `activity`. The parser
emits both events for them; the deriver never double counts because it reads
kinds separately.

The record shapes above were verified against Claude Code 2.1.274 transcripts on
2026-09-17. Field names are not a published API and may drift; the CLAUDE.md of the
repo records each drift when it happens.

## Buckets and metrics

Time is local. A day is the 24 local hour labels `00`..`23`; an event belongs to
the bucket named by its local date and hour. On a DST fall-back day two wall-clock
hours share one label and merge into one bucket; on a spring-forward day one label
stays empty. A week view is `--days` days ending on `--to` (default today).

Ordering: before deriving anything, all events from all files are sorted by
`ts`, then `sessionId`, then their position in the parsed input. Every
"consecutive" below refers to this order. File discovery order never affects a
result.

Look-back: the deriver receives events from `windowStart - LOOKBACK` (3 hours)
onward. Events before `windowStart` contribute only to `streakMin`; they are
never bucketed. Because the streak component of the index saturates at 120
minutes, the index is exact at the window boundary. The displayed `streakMin`
of a streak that started more than 3 hours before the window is floored at what
the look-back sees, which is the one documented approximation.

Per bucket:

| metric | definition |
|---|---|
| `sessions` | distinct `sessionId` with at least one `activity` event in the bucket |
| `prompts` | count of `prompt` |
| `interrupts`, `rejects`, `questions`, `plans`, `modeSwitches` | counts of the matching kinds |
| `decisions` | `interrupts + rejects + questions + plans + modeSwitches` |
| `contextSwitches` | over all `prompt` events in the bucket sorted by `ts`, the number of consecutive pairs whose `sessionId` differs |
| `activeMin` | number of distinct 5-minute slots in the bucket holding at least one `activity` event, times 5 |
| `streakMin` | length in minutes of the activity streak that contains the last `activity` event of the bucket, measured from the streak's first event (which may lie in the look-back, before the window). A streak breaks on a gap longer than 10 minutes between consecutive `activity` events in the global order, across all sessions. 0 when the bucket has no activity. |
| `lateNight` | bucket hour in {23, 0, 1, 2, 3, 4, 5} |

Per day: `peak` (max index over buckets with activity), `mean` (mean index over
buckets with activity, rounded), `activeMin` (sum), and the sums of every count.

## Index

Each bucket with activity gets five normalized components in `[0, 1]`:

```
parallel  = clamp((sessions - 1) / 4)      # 1 session → 0, 3 → 0.5, 5+ → 1
pace      = clamp(prompts / 40)            # 20 prompts/hour → 0.5
decisions = clamp(decisions / 20)          # 10 decisions/hour → 0.5
streak    = clamp(streakMin / 120)         # 60 min → 0.5, 2h+ → 1
late      = lateNight ? 1 : 0

index = round(30*parallel + 20*pace + 20*decisions + 15*streak + 15*late)
```

The weights are integer points of 100 (30/20/20/15/15, the same as 0.30/0.20/0.20/
0.15/0.15). They are kept as integers so that half-point sums such as 57.5 stay
exact in floating point and round the same way every time; with fractional
weights, 0.15·0.5 sums drift to 57.4999… and the index can come out one lower
than the formula says. The five weighted terms are the `parts` a bucket
reports (rounded to one decimal for display); the index is the rounded sum of
the unrounded terms.

A bucket without activity has no index (rendered as `·`, `null` in JSON).

Levels: 0–29 Calm, 30–59 Warming, 60–84 Heating, 85–100 Fried.

The parallel-session thresholds follow the research summary this project started
from: BCG/HBR (productivity drops past three simultaneous AI tools) and Osmani
("three focused teammates outperform five scattered ones"). The other norms are
starting guesses and exist to be calibrated against the week picture. Weights and
norms live in one exported constant in `src/score.ts` so a change is one diff.

## CLI

Runs from TypeScript on Bun, no build step. `bin.zapara` points at `src/index.ts`
with a `#!/usr/bin/env bun` shebang.

```
zapara                          # same as `zapara week`
zapara week [--days 7] [--to YYYY-MM-DD]
zapara day [YYYY-MM-DD] [--explain]
common flags: --json  --projects <dir>  --no-color  --help  --version
```

`week` prints one row per day, 24 cells, then `peak` and `active`:

```
            00 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20 21 22 23   peak  active
Mon 14/09    ·  ·  ·  ·  ·  ·  ·  ·  ░  ▒  ▒  ▓  ▓  █  █  ▓  ▒  ░  ·  ·  ░  ▒  ▒  ░    87   9h40
```

Cell glyphs by level: `·` no activity, `░` Calm, `▒` Warming, `▓` Heating, `█`
Fried. In a TTY the glyphs are colored green / yellow / magenta / red; in a pipe or
with `--no-color` / `NO_COLOR` they are plain. Below the grid: a legend line and the
week totals (active time, prompts, decisions, max sessions).

`day` prints one row per bucket that has activity:

```
hour   index  level    sess  prompts  intr  rej  quest  plan  mode  ctx-sw  streak
13:00     87  Fried       5       24     6    2      3     1     2       4    95m
```

`--explain` adds five columns with each weighted contribution (`par 30 pace 12 dec
20 strk 12 late 0`), so the number can be traced to its inputs.

`--json` prints the same data as one JSON document: for `week`, an array of days,
each with `date`, `peak`, `mean`, `activeMin`, totals and a `buckets` array of 24
entries, each with `hour`, every metric, and `score`, which is
`{ index, level, parts }` or `null` when the bucket has no activity; for `day`,
one such day. JSON is also the default when stdout is not a TTY.

Defaults and validation: `day` without a date means today (local). `--to`
defaults to today. `--days` defaults to 7 and accepts an integer from 1 to 90.
A date must be `YYYY-MM-DD` and a real calendar date. Any other value, an
unknown command or an unknown flag prints one line plus usage to stderr, exit 2.

Errors: a missing or unreadable projects directory prints one line to stderr
without the path, exit 1. Anything unexpected prints one line to stderr, never
a stack trace, exit 1. A window with no data prints the empty grid (or an
empty day table) and exits 0.

## Architecture

Functional core, imperative shell. The core is pure functions over plain data:
no file system, no clock, no environment, no output. The shell is three small
files that do all the I/O and call the core.

```
shell (I/O)
  src/index.ts    argv → options; calls report(); prints; exit codes; the only try/catch
  src/report.ts   report(options) → Day[]: lists files (scan), reads them, calls analyze()
  src/scan.ts     projects dir + cutoff → sorted file paths (fs.stat for mtime)

core (pure)
  src/analyze.ts  analyze(transcripts, window) → Day[]   transcripts = { path, text }[]
  src/parse.ts    JSONL text → Event[]
  src/derive.ts   Event[] + window → Day[] with HourBucket metrics (sorts, applies look-back)
  src/score.ts    metrics → { index, level, parts }; exports WEIGHTS, NORMS, LEVELS
  src/render.ts   Day[] → string for week / day / explain / json (never writes)
  src/types.ts    Event, HourBucket, Day, Score, Window
```

`analyze()` is the core's entry point: it takes transcript contents already in
memory, in the real JSONL format, plus a window (`{ to, days }`) and returns
the same `Day[]` the CLI prints. Fixture tests feed it directly with in-memory
transcripts and get the statistics back without touching the disk; the CLI test
and the report test cover the shell.

Rules: the shell may import any core module; core modules never import the
shell (`render` and `derive` import `score` and `types`; `analyze` imports
`parse` and `derive`; `report` imports `scan`, `analyze` and `derive`
(`windowBounds`); `index` imports `report`, `render` and `derive`
(`localDate`); nothing imports `index`). Core modules import nothing from
`node:` or `Bun`. The current time is a parameter, never `Date.now()` inside
the core. Named exports only. No runtime dependencies; `typescript` is the one
devDependency, for `tsc --noEmit`.

Performance target: a week view over this machine's `~/.claude/projects` (about
2 900 files, mostly filtered by mtime) under 2 seconds.

## Testing

Tests follow Kent Beck's Test Desiderata: behavioral and structure-insensitive
(they exercise what the tool reports, not how modules are wired), deterministic,
fast, readable, and specific enough that a failure names the broken behavior.
Unit tests are kept to a minimum; the bulk of the suite runs the whole pipeline
over fixture transcripts and asserts the resulting statistics.

Public seams for tests: `analyze(transcripts, window)` in the core takes in-memory
transcripts, and `src/report.ts` exports `report({ projects, to, days, now })`,
which runs scan → parse → derive → score and returns `Day[]`, the same structure
`--json` prints. The CLI is a thin layer over it. Tests call `analyze()`, `report()` or spawn
the CLI; they never import `parse`, `derive` or `scan` directly. Refactoring the
internals must not touch a test.

Fixtures are real-format transcripts:

- `tests/fixtures/<scenario>/` is a projects tree in the exact on-disk layout
  (`<slug>/<session>.jsonl`, `<slug>/<session>/subagents/agent-*.jsonl`). Lines
  use the real field names and shapes of Claude Code 2.1.274 records: `type`,
  `timestamp`, `sessionId`, `isMeta`, `isSidechain`, `message.content` blocks,
  `permission-mode` records, and so on. They are redacted copies of real lines or
  built by the helper below; message text is a placeholder.
- `tests/helpers/transcript.ts` builds such lines and files from a compact
  script (`prompt(ts, sid)`, `interrupt(ts, sid)`, `reject`, `question`,
  `plan`, `mode(sid, "plan")`, `assistant(ts, sid)`) and writes a scenario
  tree into a temp directory, setting file mtimes explicitly. Edge cases that
  need exact timestamps use the builder; representative scenarios live on disk.
- Each scenario has an `expected.json` (or inline expectations) with the
  `Day[]` statistics it must produce for a fixed `--to` and `now`.

Scenarios, one directory or builder script each:

- `busy-week`: 7 days with varied load, the reference picture; pins peaks,
  active minutes, per-day totals and the rendered week grid.
- `hour-edges`: events at `:59:59.999` and `:00:00.000`, and across midnight.
- `parallel-sessions`: 1, 3 and 5 sessions in one hour; context switches
  between them; a single session yields zero switches.
- `streak`: activity across sessions with a 9-minute gap (continues) and an
  11-minute gap (breaks); a streak that starts in the 3-hour look-back before
  the window (regression for the boundary); a file with mtime before the
  cutoff that must be ignored.
- `decisions`: interrupts of both marker forms, tool rejections,
  `AskUserQuestion`, `ExitPlanMode`, repeated `permission-mode` records
  collapsing to one switch, a `permission-mode` record before any timestamp
  dropped.
- `noise`: `isMeta` messages, a `subagents/` tree with prompts that must not
  count, `isSidechain` records in a main file, malformed JSON lines, lines
  without `type` or `timestamp`, an empty file, an unreadable file.
- `report`: through `report()`, not `analyze()` — a `subagents/` tree whose
  prompts don't count, a same-named file at the root that does, a file just
  before the mtime cutoff excluded and one exactly at it included, a `.txt`
  file ignored, an unreadable file skipped, and a missing or non-directory
  root rejected without printing the path.
- `empty`: a projects tree with no transcripts in the window (empty grid, exit 0),
  and a missing root (exit 1).
- `cli`: spawns `bun src/index.ts --projects <fixture>` for `week`, `day`,
  `--explain`, `--json`, a bad date and an unknown flag; pins the JSON output,
  exit codes, stderr and the JSON-in-a-pipe default. The rendered text of
  `week`, `day` and `--explain` is pinned separately, in
  `tests/render/render.test.ts` through `report()`, because a spawned process
  never has a TTY.

Order independence: one test shuffles the fixture files' creation order and
names and asserts identical output.

The only unit test is `score.test.ts`: a table of metric rows → index, covering
each component at 0, mid and cap, the level boundaries 29/30, 59/60, 84/85, and a
no-activity bucket yielding `null`. The formula is the one place where a direct
table is more readable than a fixture.

`bun test` runs with `TZ=UTC`. Each test must fail under a one-line mutation of
the behavior it pins.

## Repository

Private GitHub repository `drakulavich/zapara`. MIT. Layout follows pult and
oura-cli: `package.json` with `bin`, `test`, `typecheck` and `check` scripts;
`tsconfig.json` strict with `noUncheckedIndexedAccess`; `README.md` with quick
start and the week picture; `CHANGELOG.md` (Keep a Changelog); `CLAUDE.md` as a
list of mistakes actually made here; `docs/superpowers/{specs,plans}`; GitHub
Actions CI with `oven-sh/setup-bun` running typecheck and tests.

## Later

Signals visible in the data but not scored in the MVP: subagent count per bucket
(`subagents/` files), prompt length (which would need a change to the privacy contract), `worktree-state`, and `agent-name` records.
Hooks would add permission decisions and model switches in real time. These wait
for the week picture to say whether the base formula is even close.
