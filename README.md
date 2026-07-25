# Delta Flow

The directory diff viewer that lives where you already work: VS Code, Git, and
Tower.

Delta Flow turns a Git directory diff into a clear, read-only file tree inside
VS Code. It is built for the moments when a line-by-line diff is too narrow:
large refactors, migrations, file moves, generated changes, and changesets where
the shape of the tree matters as much as the content.

Open a changeset from Tower or `git difftool --dir-diff`, then browse every file
that was added, changed, deleted, moved, renamed, or copied. Click any file to
open the diff in VS Code. Files that only moved are shown as moves, not noise.

## Highlights

- A focused Changed Files tree for the whole Git changeset
- Rename, copy, and move detection powered by Git
- Read-only diffs for temporary Git/Tower directory snapshots
- Text, image, and binary-aware diff handling
- Keyboard navigation, path filtering, and changed-line search
- One-command Tower for Mac integration

## Install Locally

Delta Flow is not in the Marketplace yet. To build and install the extension
locally:

```sh
npm install
npm run package                                  # -> delta-flow-<version>.vsix
code --install-extension delta-flow-*.vsix --force
```

Or use the bundled VS Code tasks from Terminal > Run Task:

- **Package Extension**
- **Install Extension (local)**
- **Redeploy**

## Use With Tower

Run **Delta Flow: Install Tower Integration** from the Command Palette. It copies
the launcher into Tower's `CompareTools` directory and adds the
`CompareTools.plist` entry while preserving any tools you already have.

Restart Tower, then choose **Delta Flow** as your diff tool in Settings > Git
Config.

## Use With Git

Add Delta Flow as a directory diff tool:

```ini
# ~/.gitconfig
[difftool "delta-flow"]
    cmd = /absolute/path/to/delta-flow/bin/delta-flow \"$LOCAL\" \"$REMOTE\"
[difftool]
    prompt = false
```

Then run:

```sh
git difftool --dir-diff --tool=delta-flow <rev>
```

If `code` is not on your `PATH` in Tower or another GUI client, set
`DELTA_FLOW_CODE` to the absolute path of the VS Code CLI.

## Development

```sh
npm install
npm run compile
```

Press F5 in VS Code to launch an Extension Development Host with the bundled demo
workspace.

For the technical flow from Git/Tower to VS Code, see
[How It Works](docs/how-it-works.md).
