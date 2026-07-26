# Delta Flow

The directory diff viewer that lives where you already work: VS Code, Git, and
Tower.

![Delta Flow browsing a directory diff](media/delta-flow-demo.gif)

Delta Flow turns a Git directory diff into a clear, read-only file tree inside
VS Code. It is built for the moments when a line-by-line diff is too narrow:
large refactors, migrations, file moves, generated changes, and changesets where
the shape of the tree matters as much as the content.

Browse every file that was added, changed, deleted, moved, renamed, or copied,
then select a file to open its diff in VS Code.

## Get Started

1. Install **[Delta Flow](https://marketplace.visualstudio.com/items?itemName=grantyb.delta-flow)**
   from the VS Code Marketplace.
2. Open a Git repository in VS Code.
3. Run **Delta Flow: Diff Working Tree** from the Command Palette.

Delta Flow opens the current working-tree changes as a navigable directory diff
in a new VS Code window.

## Highlights

- A focused Changed Files tree for the whole Git changeset
- Rename, copy, and move detection powered by Git
- Read-only diffs for temporary Git/Tower directory snapshots
- Text, image, and binary-aware diff handling
- Keyboard navigation, path filtering, and changed-line search
- One-command Tower integration for macOS and Windows

## Connect Tower

Run **Delta Flow: Install Tower Integration** from the Command Palette, then
restart Tower and choose **Delta Flow** in **Settings > Git Config**.

Tower can then open any commit, branch comparison, or working-tree changeset
directly in Delta Flow.
