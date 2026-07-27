# AGENTS.md

Notes for anyone (human or AI) working in this repo.

## Releasing

Run `npm run release`. It prompts for the new version (defaulting to the next
patch), writes it into `package.json`, then runs `vsce publish`. Publishing
triggers `vscode:prepublish` → `compile`, which regenerates the integration
version markers (see below), so a single prompt keeps everything in sync.

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

The anchor folder lives under a **stable per-user root**
(`${TMPDIR}/delta-flow/sessions/<random>/<name>`) rather than a fresh random temp
dir. This lets the user trust `.../delta-flow/sessions` once; VS Code inherits that
trust for every future session, suppressing the Restricted Mode banner. Only the
`sessions/` child is meant to be trusted — keep anything else we write in temp as a
sibling, outside that path. On a shared `/tmp` the bash launcher creates the root
`0700` and refuses a pre-existing symlink or foreign-owned dir.

The extension already declares `capabilities.untrustedWorkspaces.supported` in
`package.json`, so it is fully functional even before the folder is trusted; the
banner is cosmetic. On the first Restricted-Mode comparison the extension shows a
one-time hint (`offerTrustGuidance` in `src/extension.ts`) pointing the user at the
`sessions` root and the Workspace Trust editor.
