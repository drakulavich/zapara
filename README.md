# zapara

Cognitive load index for people driving Claude Code. Reads the transcripts
Claude Code already writes under `~/.claude/projects`, scores every hour
0–100 from parallel sessions, prompt pace, decisions (interrupts, rejections,
questions, plan reviews, mode switches), streak length and late-night work,
and prints a week heatmap and a per-hour day table. Nothing is installed into
Claude Code, nothing leaves the machine, no message text is kept.

Status: MVP under construction. See `docs/superpowers/specs/` for the design.

## Run

```sh
bun install
bun run src/index.ts --version
bun run stats --days 14
```
