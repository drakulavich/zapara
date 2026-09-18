# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
