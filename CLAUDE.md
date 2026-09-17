# CLAUDE.md

Project rules for every coding agent working here. The design is in
`docs/superpowers/specs/2026-09-17-zapara-design.md`; when this file and the
spec disagree, say so instead of picking one. Below the rules is the list of
mistakes actually made in this repo that nothing yet prevents; a line leaves
when a test or CI step comes to catch it.

## Rules

- **Bun runs the TypeScript directly.** No build step, no `dist/`, no bundler.
  `bin` points at `src/index.ts` with a `#!/usr/bin/env bun` shebang. The only
  devDependency is `typescript`, for `bun run typecheck`. No runtime dependencies.
- **Tests are fixture-driven, in the real transcript format.** A test builds or
  loads a projects tree of `.jsonl` files shaped exactly like Claude Code writes
  them (`type`, `timestamp`, `sessionId`, `isMeta`, `isSidechain`,
  `message.content` blocks, `permission-mode` records, `<session>/subagents/`),
  runs the whole pipeline through `report()` or the CLI, and asserts the
  statistics that come out. Edge cases and negative cases (malformed lines,
  subagent trees, mtime cutoffs, missing roots) are fixtures too. Tests never
  import `parse`, `derive` or `scan`; refactoring internals must not touch a
  test. Unit tests are the exception, not the norm: `score.test.ts` is the one
  allowed, because a formula table reads better than a fixture.
- **Follow Kent Beck's Test Desiderata**: behavioral, structure-insensitive,
  deterministic, fast, readable, specific. A failure must name the behavior
  that broke, not the function that changed. Fixed `--to` and `now`, `TZ=UTC`,
  explicit mtimes.
- **A new test must fail under a one-line mutation** of the behavior it pins.
  Reviews make the mutation to check.
- **Never print a stack trace.** The CLI prints one line to stderr and exits 1
  or 2. A bad transcript line is skipped, never fatal.
- **Privacy contract.** Message text is compared against fixed markers and
  discarded. No text, prompt length, file path or title is kept, written or
  printed. A change to this needs the spec updated first.
- **Weights and norms live in one constant in `src/score.ts`.** Calibration is
  one diff there plus a CHANGELOG line.

## Mistakes made here

(none yet)
