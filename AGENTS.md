# AGENTS.md

Notes for anyone (human or AI) working in this repo.

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
banner is cosmetic.
