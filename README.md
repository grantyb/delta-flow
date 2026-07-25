# Git Directory Diff

A read-only git directory diff viewer for VS Code, usable as an external diff
tool from clients such as [Tower](https://www.git-tower.com/) via
`git difftool --dir-diff`.

When launched, VS Code opens with every changed file in a folder-hierarchy
sidebar (expanded by default). Clicking a file opens its diff — read-only — in
the editor pane. Renames and moves are detected and shown as a single node at the
file's new location, annotated with the old path and a similarity score.

## How it works

Tower (and other clients) run standard `git difftool` in the background. With the
"Perform directory diff" option enabled, git snapshots both sides of the change
into two temp directories and invokes the configured tool once with those two
directory paths.

- `bin/git-dir-diff` is that tool. It writes the two paths into a throwaway
  `.code-workspace` and opens VS Code with `--wait`, so git keeps the temp trees
  alive until the window is closed.
- The extension reads the session, runs
  `git diff --no-index --find-renames --find-copies --raw` over the two trees to
  get an authoritative, rename-aware change list, and renders the tree.
- Diffs are served through a `TextDocumentContentProvider`, which makes both
  sides strictly read-only.

## Build

```sh
npm install
npm run compile
```

Then press F5 in VS Code to launch an Extension Development Host.

## Package and install

Build a `.vsix` and install it into VS Code:

```sh
npm run package                                  # -> git-dir-diff-<version>.vsix
code --install-extension git-dir-diff-*.vsix --force
```

Or use the bundled VS Code tasks (Terminal → Run Task): **Package Extension**,
**Install Extension (local)**, or **Redeploy** (packages and installs in one step).

To register with Tower, run the **Git Directory Diff: Install Tower Integration**
command from the Command Palette. It copies the launcher into Tower's
`CompareTools` directory and adds the `CompareTools.plist` entry (preserving any
existing tools), then you restart Tower and pick **VS Code Directory Diff** as the
diff tool (Settings → Git Config).

## Wire up as a git difftool (CLI, optional)

```ini
# ~/.gitconfig
[difftool "vscode-dirdiff"]
    cmd = /absolute/path/to/git-dir-diff/bin/git-dir-diff \"$LOCAL\" \"$REMOTE\"
[difftool]
    prompt = false
```

Test from the CLI:

```sh
git difftool --dir-diff --tool=vscode-dirdiff <rev>
```

In Tower, select the custom tool and enable **Perform directory diff** (Settings
→ Git Config). If `code` is not on your `PATH` in Tower's environment, set
`GIT_DIR_DIFF_CODE` to the absolute path of the VS Code CLI.

## Status

Packaged extension: folder-hierarchy tree with rename/move detection, read-only
diffs (text, image, and binary), keyboard navigation, path and change-content
filters, and a one-command Tower installer. Not yet in the Marketplace.

Before publishing, revisit the `*` activation event (used for an early panel
reveal) — a Marketplace extension should prefer `onStartupFinished` plus
`onCommand:` activations to avoid activating in every window.
