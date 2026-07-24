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

Then press F5 in VS Code to launch an Extension Development Host, or package with
`vsce package`.

## Wire up as a git difftool

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

Walking skeleton: expanded folder tree, rename/move detection, read-only diffs.
Not yet handled: lazy content loading for very large diffs (see the `--no-index`
provider swap discussed in design), binary files, and Tower packaging.
