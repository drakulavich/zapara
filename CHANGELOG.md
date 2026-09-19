# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.3.1] - 2026-09-19

### Changed
- Streak and active minutes count your presence, not the agent's: a streak is your prompts no more than 10 minutes apart across sessions, and active minutes are the five-minute slots those streaks cover. Agent work while you are away no longer keeps a streak alive or fills the day.

## [0.3.0] - 2026-09-19

### Added
- A window that includes today says when the snapshot was taken: `asOf` on today's JSON entry and an `as of HH:MM, this hour is still running` line under the tables.
- `zapara status` writes today's load to `~/.claude/zapara/status.json` for a status line to read; the file format and the reader's refresh contract are in the spec.

### Fixed
- A window or output flag given twice (`--days 3 --days 5`) is a usage error, `--days given twice`, instead of the last value winning silently.
- A transcript whose modification time is older than the window is still read when the last timestamp in it falls inside the window; before, a restored or synced file was dropped in full without a word.

## [0.2.0] - 2026-09-18

### Changed
- The command line is the window and the view, not names for windows: `zapara` is the grid of the last 7 days, `zapara --days 30`, `zapara --to 2026-09-14` or `zapara --from 2026-09-01 --to 2026-09-14` any window up to 90 days; `zapara today`, `zapara yesterday` or `zapara 2026-09-14` one day, hour by hour; `zapara card` the picture, with the same window flags. `week` and `day` are gone. A date is `YYYY-MM-DD`, `today` or `yesterday` everywhere; `--days=30` works beside `--days 30`; `-V` beside `--version`.
- A usage error prints its line and `run 'zapara --help' for usage`, exit 2, instead of the whole usage screen; `--help` is one screen under 80 columns.

### Fixed
- `--days -1` is answered by the range message (`--days must be 1..90, got -1`) instead of `--days needs a value`: a negative number is a value, not a flag.
- A projects directory that exists but cannot be read says so (`projects directory cannot be read (check its permissions)`, exit 1) instead of `not found`; the message still names no path.
- The README's screencast and card show on npmjs.com: both images use absolute raw.githubusercontent.com URLs, and the demo files left Git LFS, whose objects the raw endpoint serves as pointer text.

## [0.1.0] - 2026-09-18

### Added
- Project scaffold: Bun runs `src/index.ts` directly, `bun run check` typechecks and tests.
- `analyze()`: hourly buckets with sessions, prompts, decisions, context switches, active minutes, streak and late-night flag, scored 0–100, from real-format transcripts.
- CLI: `zapara week` and `zapara day` with `--json`, `--to`, `--days`, `--projects`; scans `~/.claude/projects`, skipping subagent transcripts and files older than the window.
- Week heatmap and day table with `--explain`; colors in a TTY, JSON in a pipe.
- Inbound messages from subagents, other sessions and background tasks are counted as `reports`, separate from human `prompts`; assistant output tokens are summed once per request as `outputTokens`. Both are measured and shown in the day table, week totals and JSON.
- `bun run stats`: per-hour signal distributions (n, p50, p75, p90, max, zero) over the active hours of a window, top 8 hours by reports and by human prompts, and a transcript-format drift line (records vs. events recognised by the parser), for comparing the same window across two machines before calibrating `src/score.ts`. Numbers only; never a file path or message text.
- `zapara card`: the last 14 days as one 2400×1260 picture (PNG, WebP, or the HTML page itself): one of four characters by dominant load, a sentence, the peak hour, the share of hours at each level, three highlights. Rendered locally by `Bun.WebView`; the page embeds its fonts and character sheet and references nothing. `--json` prints the card's data. The only command that writes a file.
- Published on npm as `@drakulavich/zapara`: `bunx @drakulavich/zapara@latest` runs it without a clone; releases publish from GitHub Actions with OIDC trusted publishing and provenance, no npm token.

### Changed
- Score weights are integer points of 100 so half-point sums round exactly; the index is the rounded sum of the unrounded weighted parts.
- Index calibrated on two machines × 14 days: parallel 25 (norm 4 sessions), pace 15 (norm 20 prompts/h), supervision 30 (3·decisions + reports + context switches, norm 45), reading 10 (norm 80k output tokens), streak 10, late night 10. `parts` in JSON and `--explain` are now six: `par pace sup read strk late`.
- Week footer: the legend drops the ranges and the "none" entry, the totals line drops its prefix and commas, and both are dimmed in a TTY; the level ranges are in `--help`; counts past 9 999 print compact (12k, 1.2M).
- Day table: an event column that is 0 in every row is left out, and one dimmed line names what the day had none of; the skeleton columns always show.

### Fixed
- A symlink loop or an unreadable directory anywhere under the projects root no longer aborts the scan as `projects directory not found`; that directory is skipped and every other transcript still counts. Symlinks are not followed.
- "1 session at once", "1 agent report", "1 prompt": the card sentence and the week footer use the singular for exactly one.
