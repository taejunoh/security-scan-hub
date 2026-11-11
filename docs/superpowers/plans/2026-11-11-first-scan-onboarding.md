# First-scan onboarding implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development when delegation is authorized and the work is separable. Use superpowers:executing-plans for inline plan execution. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Let a first-time nondeveloper understand and finish a basic scan or a clearly labeled example scan.

**Architecture:** Keep the shared web renderer, add desktop-only progressive onboarding, and extend the existing trusted native scan host with bounded folder guidance and a bundled example selector. Preserve existing scan engine and trust boundaries.

**Tech Stack:** Vanilla JavaScript ES modules, Electron, Node test runner, native OSV, deterministic icon assets.

## Global constraints

- Follow the adjacent approved design spec; no new provider accounts, paid AI scans, publishing, or scope expansion.
- Preserve browser-only viewer behavior, native IPC validation, path/ACL protections, bundle/data identifiers, and original scan evidence.
- Example scans are real OSV runs, use only bundled OSV, and remain labeled as examples in saved results.
- Keep English and Korean in sync; review both desktop and 360px narrow layouts.
- Shared checkout: each worker owns assigned files and preserves others' edits.

## Tasks

- [x] Inspect current desktop renderer, scan host, branding/build, and tests; establish baseline clean commit 1ea89b2.
- [x] Host: add guidance helper and regression tests; extend desktop-execution.mjs, main.cjs/preload.cjs with chooseDemo; package a fixed lockfile; retain explicit user gesture and OSV-only example execution.
- [x] UI: update src/web/index.html, execution-view.mjs, app.mjs, i18n.mjs, style.css and relevant dashboard tests for welcome, folder help, example/own-code flow, progressive advanced/results views, and accessible errors.
- [x] Branding: update desktop/build.mjs, desktop/msix/build.mjs, assets and build tests; produce/inspect custom ICNS/ICO/Store tiles and named Mac bundle; keep stable identities and Windows PE integrity.
- [x] Integration: adapt desktop/app/smoke.mjs to new bridge/entry paths, run focused desktop/dashboard tests then full relevant suites after source freezes.
- [x] Review: independent code/spec review of new IPC, demo staging/provenance and renderer behavior; fix concrete findings and rerun affected tests.
- [x] Actual UI: use CUA to traverse own-code and example paths on built app, inspect report/recommendation states, check English/Korean and wide/narrow layouts; save screenshots.
- [x] Update beginner guides and verification record with observed results and platform limits; no deployment claim.

## Verification commands

`node --test desktop/test/*.test.mjs` checks host/build contracts.
`node --test test/dashboard-*.test.mjs` checks dashboard, localization and renderer flows.
`SEC_HUB_TEST_CLOUDFLARE_ROOT="$PWD/../../tools/cloudflare-security-audit" npm test`
checks the core suite with its required pinned fixture. Use existing desktop build/smoke
scripts for actual packaged verification; record architecture/output paths and exit status.

## Ledger

2026-11-11: User approved all previously proposed improvements. Existing checkout is reused
on codex/first-scan-onboarding; no duplicate approval requested. Workers own host, UI,
and branding separately. The native example path was chosen over replaying the preloaded
saved report so first-use verification exercises a real scan and never confuses sample
history with newly checked user code.
