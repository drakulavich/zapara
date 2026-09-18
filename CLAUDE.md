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
- **Releases go through `npm-publish.yml` only.** Bump `version` in
  `package.json` and move the CHANGELOG's Unreleased entries under the new
  version on `main`, tag `vX.Y.Z`, publish the GitHub release; the workflow
  checks, verifies the version against the tag and publishes with OIDC
  provenance. Never publish from a laptop.
- **Functional core, imperative shell.** `src/index.ts`, `src/report.ts`,
  `src/scan.ts` and `src/image.ts` are the only files that touch argv, stdout,
  the file system or the clock; `src/image.ts` is the only one that may use
  `Bun.WebView` or `Bun.Image`, read the card assets, or write a file (the
  card). Everything else is pure functions over plain data: `analyze()` takes
  transcript text already in memory and a window with an explicit `now`, and
  returns the `Day[]` the CLI prints; `render` and `cardHtml` return strings.
  A core module that imports from `node:` or `Bun`, or calls `Date.now()`, is
  a bug.
- **Tests are fixture-driven, in the real transcript format.** A test builds or
  loads transcripts (in memory for `analyze()`, or a projects tree on disk for
  the CLI) shaped exactly like Claude Code writes them (`type`, `timestamp`, `sessionId`, `isMeta`, `isSidechain`,
  `message.content` blocks, `permission-mode` records, `<session>/subagents/`),
  runs the pipeline through `analyze()`, `report()` or the CLI, and asserts the
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
- **Index weights and norms live in one constant in `src/score.ts`.** Calibration
  is one diff there plus a CHANGELOG line. The card's ranking norms
  (`CARD_NORMS` in `src/card.ts`) order highlights on a picture and never enter
  the index.

## Mistakes made here

(none yet)
