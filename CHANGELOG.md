# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Project scaffold: Bun runs `src/index.ts` directly, `bun run check` typechecks and tests.

### Changed
- Score weights are integer points of 100 (30/20/20/15/15) so half-point sums round exactly; the index is the rounded sum of the unrounded weighted parts.
