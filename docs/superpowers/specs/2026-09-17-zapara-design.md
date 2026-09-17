# zapara: cognitive load index from Claude Code transcripts

Date: 2026-09-17. Status: approved design for the MVP.

## Purpose

`zapara` reads the transcripts Claude Code already writes under `~/.claude/projects`
and turns them into an hourly Cognitive Load Index (0–100) for the person driving
the sessions. The MVP has one job: show a week of history as a picture that a human
can check against their own memory, so the formula can be judged and calibrated.
Nothing is installed into Claude Code, nothing leaves the machine, and prompt text
is never read beyond its length.

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
- Skip a file whose mtime is earlier than the start of the requested window. A file
  modified before the window cannot contain events inside it. This keeps a
  week view from parsing thousands of old files.
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
| `mode_change` | `type == "permission-mode"`. Has no timestamp: it takes the `ts` of the last timestamped record seen earlier in the same file. If none has been seen yet, the record is dropped. Consecutive records with the same `permissionMode` in one file count once (Claude Code rewrites the same mode repeatedly). |
| `activity` | Every `type == "user"` or `type == "assistant"` record with a timestamp, including `isMeta` ones. Used for session liveness, streaks and active minutes. |

`prompt`, `interrupt` and `reject` records are also `activity`. The parser
emits both events for them; the deriver never double counts because it reads
kinds separately.

The record shapes above were verified against Claude Code 2.1.274 transcripts on
2026-09-17. Field names are not a published API and may drift; the CLAUDE.md of the
repo records each drift when it happens.

## Buckets and metrics

Time is local. The unit is the hour bucket: events with `ts` in `[h, h+1h)`.
A day is 24 buckets; a week view is 7 days ending on `--to` (default today).

Per bucket:

| metric | definition |
|---|---|
| `sessions` | distinct `sessionId` with at least one `activity` event in the bucket |
| `prompts` | count of `prompt` |
| `interrupts`, `rejects`, `questions`, `plans`, `modeSwitches` | counts of the matching kinds |
| `decisions` | `interrupts + rejects + questions + plans + modeSwitches` |
| `contextSwitches` | over all `prompt` events in the bucket sorted by `ts`, the number of consecutive pairs whose `sessionId` differs |
| `activeMin` | number of distinct 5-minute slots in the bucket holding at least one `activity` event, times 5 |
| `streakMin` | length in minutes of the activity streak that contains the last `activity` event of the bucket, measured from the streak's first event. A streak breaks on a gap longer than 10 minutes between consecutive `activity` events, across all sessions. 0 when the bucket has no activity. |
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

index = round(100 * (0.30*parallel + 0.20*pace + 0.20*decisions + 0.15*streak + 0.15*late))
```

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
entries (`hour`, `index`, `level`, every metric, `parts`); for `day`, one such day.
JSON is also the default when stdout is not a TTY.

Errors: unknown command or flag prints usage to stderr, exit 2. A missing projects
directory prints one line to stderr, exit 1. Anything unexpected prints one line
to stderr, never a stack trace, exit 1. A week with no data prints the empty grid
and exits 0.

## Architecture

```
src/index.ts    argv → command; TTY/JSON switch; the only try/catch
src/scan.ts     projects dir → file paths (skip subagents/, mtime filter)
src/parse.ts    JSONL text → Event[]  (pure: string in, events out)
src/derive.ts   Event[] + date range → Day[] with HourBucket metrics
src/score.ts    metrics → { index, level, parts }; exports WEIGHTS, NORMS, LEVELS
src/render.ts   Day[] → strings for week / day / explain
src/types.ts    Event, HourBucket, Day, Score
```

Layers depend only downward: `render` and `derive` import `score` and `types`;
`index` imports everything; nothing imports `index`. Named exports only. No
runtime dependencies; `typescript` is the one devDependency, for `tsc --noEmit`.

Performance target: a week view over this machine's `~/.claude/projects` (about
2 900 files, mostly filtered by mtime) under 2 seconds.

## Testing

`bun test` with co-located `*.test.ts`, run with `TZ=UTC` so bucket boundaries in
tests are deterministic.

- `parse.test.ts`: one test per event kind on hand-written JSONL lines, plus
  malformed line, missing timestamp, `isMeta`, `isSidechain`, mode dedupe, and
  the interrupt-vs-prompt distinction.
- `derive.test.ts`: bucket assignment at hour edges, sessions, contextSwitches,
  activeMin slots, streak across sessions and across the 10-minute gap.
- `score.test.ts`: each component at 0, mid and cap; level boundaries 29/30,
  59/60, 84/85; no-activity bucket yields null.
- `render.test.ts`: the week grid and day table pinned as strings on a fixture.
- `index.test.ts`: spawns `bun src/index.ts --projects tests/fixtures/projects`
  for `week --to <date>` and `day <date> --json` and checks output and exit codes.
- `tests/fixtures/projects/` holds a small synthetic projects tree, including a
  `subagents/` file that must be ignored.

Each test must fail under a one-line mutation of the code it pins.

## Repository

Private GitHub repository `drakulavich/zapara`. MIT. Layout follows pult and
oura-cli: `package.json` with `bin`, `test`, `typecheck` and `check` scripts;
`tsconfig.json` strict with `noUncheckedIndexedAccess`; `README.md` with quick
start and the week picture; `CHANGELOG.md` (Keep a Changelog); `CLAUDE.md` as a
list of mistakes actually made here; `docs/superpowers/{specs,plans}`; GitHub
Actions CI with `oven-sh/setup-bun` running typecheck and tests.

## Later

Signals visible in the data but not scored in the MVP: subagent count per bucket
(`subagents/` files), prompt length, `worktree-state`, and `agent-name` records.
Hooks would add permission decisions and model switches in real time. These wait
for the week picture to say whether the base formula is even close.
