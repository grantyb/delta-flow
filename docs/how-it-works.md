# How Delta Flow Works

Delta Flow is a small bridge between Git's directory-diff mode and a VS Code
tree view.

## Directory Diff Sessions

`git difftool --dir-diff` asks Git to prepare two temporary directory trees: one
for the left side of the comparison and one for the right side. Git then calls
the configured diff tool once with those two paths.

Tower for Mac can use the same contract through its CompareTools integration.
When a tool supports changesets, Tower passes the left and right directory trees
for the whole diff instead of launching a separate file comparison for every
changed file.

## The Launcher

`bin/delta-flow` is the launcher Git and Tower call. It:

1. Resolves the two directory paths Git/Tower provided.
2. Creates a temporary named folder with folder-scoped VS Code settings.
3. Stores the paths in the setting `deltaFlow.session`.
4. Opens VS Code with `--wait` so Git keeps the temporary directories alive.

The temporary folder keeps VS Code in a normal workspace window while the
extension focuses the Changed Files view. Pull request sessions use a
descriptive folder name, which also becomes the window title; opening a folder
instead of a `.code-workspace` file avoids VS Code's “(Workspace)” suffix.
For Tower and direct `git difftool` sessions, the launcher also inspects its Git
parent process and resolves compared revisions to branch, tag, or remote-branch
names when possible. If Git does not expose both revisions, the repository name
is used instead.

If a GUI client cannot find the `code` command, set `DELTA_FLOW_CODE` to the
absolute path of the VS Code CLI.

## Loading Changes

When the extension activates, it reads `deltaFlow.session` and runs Git over the
two directory trees:

```sh
git diff --no-index --find-renames --find-copies --raw <left> <right>
```

That gives Delta Flow an authoritative, rename-aware list of changed paths. The
extension then builds a folder hierarchy from those paths and renders it in the
sidebar.

Renames, copies, and moves are shown as a single node at the destination path,
with the source path in the row description. A 100% similarity score is shown as
`moved - no content change`, which is useful when a refactor changes the tree
shape without changing the file content.

## Read-Only Diffs

Diff content is served through a VS Code `TextDocumentContentProvider` under the
`delta-flow` URI scheme. That keeps both sides read-only and lets Delta Flow show
content from Git's temporary directories without copying it into the workspace.

Text files open as normal VS Code diffs. Binary files and images get safe
read-only handling, and files can be opened in an external application from the
tree context menu when VS Code is not the right viewer.

## Tower Integration

The **Delta Flow: Install Tower Integration** command copies `bin/delta-flow` to
Tower's CompareTools folder as `delta-flow.sh` and merges a Delta Flow entry into
Tower's `CompareTools.plist`.

The generated Tower entry declares:

- Visual Studio Code as the host application
- `Delta Flow` as the display name
- `delta-flow.sh` as the launch script
- changeset diff support enabled
- merge-tool support disabled

After restarting Tower, choose **Delta Flow** as the diff tool in Settings > Git
Config.

## Why It Is Read-Only

Directory-diff sessions often compare temporary trees created by Git or a GUI
client. Editing those files is surprising at best and dangerous at worst. Delta
Flow treats the session as a navigable map of a changeset, then leaves actual
source edits to your normal working tree.
