# AGENTS.md

Notes for anyone (human or AI) working in this repo.

## Releasing

Run `npm run release`. It prompts for the new version (defaulting to the next
patch), writes it into `package.json`, then runs `vsce publish`. Publishing
triggers `vscode:prepublish` → `compile`, which regenerates the integration
version markers (see below), so a single prompt keeps everything in sync.
Before publishing, it rewrites the `## NEXT_RELEASE_VERSION_NUMBER` heading in
`CHANGELOG.md` to the chosen version (see Changelog below). After publishing
succeeds, the script creates a lightweight Git tag named
`release/YYYY/MM/v<version>` using the local release date. A failed publish does
not create a tag.

## Changelog

`CHANGELOG.md` is grouped by version, newest first. Unreleased work lives under a
single `## NEXT_RELEASE_VERSION_NUMBER` heading at the top — a literal placeholder
standing in for the version the work will ship under.

When you add a feature and are asked to document it, put its notes under that
`## NEXT_RELEASE_VERSION_NUMBER` heading, creating the heading (directly below
`# Changelog`) if it is not there yet. Do **not** invent a version number:
`npm run release` replaces the placeholder with the real version once it is
chosen, so the pending notes are attributed to that release automatically.

## Tower integration version is generated — don't hand-edit it

The Tower integration version appears in three places:

- `bin/delta-flow` — `# DELTA_FLOW_TOWER_INTEGRATION_VERSION=<v>`
- `bin/delta-flow.ps1` — `DELTA_FLOW_TOWER_INTEGRATION_VERSION=<v>`
- `src/towerSetup.ts` — `export const TOWER_INTEGRATION_VERSION = '<v>'`

All three are **generated** from `package.json`'s `version` by
`scripts/sync-integration-version.js`, which runs via the `sync-integration-version`
npm script before `compile`, `watch`, and `vscode:prepublish`. Editing the markers
by hand is pointless — the next build overwrites them. To change the version, bump
`package.json` `version` (or just use `npm run release`).

Why it matters: `synchronizeTowerIntegrationIfNeeded` (in `src/towerSetup.ts`)
rewrites an already-installed Tower launcher only when the installed marker
differs from `TOWER_INTEGRATION_VERSION`. So a launcher change (e.g. `bin/delta-flow`,
`bin/delta-flow.ps1`) reaches existing installs **only after the extension version
bumps**. Ship launcher changes together with a version bump.

## The launchers and Workspace Trust

`bin/delta-flow` (macOS/Linux) and `bin/delta-flow.ps1` (Windows) are the diff-tool
launchers git/Tower invoke with two temp trees. They open a VS Code window on a
small anchor folder that carries the two paths via folder-scoped
`deltaFlow.session` settings; the extension reads those and diffs the trees.

The anchor folder lives under a **stable per-user cache root**
(`<cache>/delta-flow/sessions/<random>/<name>`) rather than a fresh random temp
dir. `<cache>` is `~/Library/Caches` (macOS), `%LOCALAPPDATA%` (Windows), or
`${XDG_CACHE_HOME:-~/.cache}` (Linux) — a readable, conventional path the user can
recognise when trusting it, chosen over an opaque temp path. This lets the user
trust `.../delta-flow/sessions` once; VS Code inherits that trust for every future
session, suppressing the Restricted Mode banner. Only the `sessions/` child is
meant to be trusted — keep anything else outside that path.

Because we no longer get OS temp reaping, the launchers sweep session anchors
older than 3 days on each run. On uninstall, `src/lifecycle.ts` (the
`vscode:uninstall` hook) removes the whole cache directory via `removeSessionCache`
in `src/sessionStore.ts`. That cache-path logic is duplicated between
`sessionStore.ts` and the launchers (`cache_base`/`sessions_root`) — keep them in
sync.

The extension already declares `capabilities.untrustedWorkspaces.supported` in
`package.json`, so it is fully functional even before the folder is trusted; the
banner is cosmetic. On the first Restricted-Mode comparison the extension shows a
one-time hint (`offerTrustGuidance` in `src/extension.ts`) pointing the user at the
`sessions` root and the Workspace Trust editor.
