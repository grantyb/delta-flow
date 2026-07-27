# Tower integration

Tower does **not** use git's `diff.tool` config — it has its own plugin system,
and it differs by platform:

- **Mac:** a `CompareTools.plist` plus a launch script under
  `~/Library/Application Support/com.fournova.Tower3/CompareTools/`.
- **Windows:** a per-tool `*.json` file under
  `%LOCALAPPDATA%\fournova\Tower\Settings\CompareTools\`.

Delta Flow ships a VS Code command that detects your OS and writes the right one,
so most people never touch either by hand.

## Install (recommended)

1. Install the Delta Flow extension in VS Code.
2. Open the Command Palette (`⌘⇧P` on Mac, `Ctrl+Shift+P` on Windows) and run
   **Delta Flow: Install Tower Integration**.

   On **Mac** it copies the launcher to `delta-flow.sh` and adds/updates the
   plist entry (leaving your other diff tools untouched). On **Windows** it copies
   `delta-flow.ps1` and writes `delta-flow.json` next to it. It's safe to re-run
   after upgrading the extension.
3. Restart Tower, then go to Settings → Git → **Diff Tool** → *Delta Flow*.

   Because the tool supports changesets, the "Perform Directory Diff" checkbox is
   not needed.

The installed launcher carries an integration version marker. On later VS Code
startups, Delta Flow synchronizes an existing integration to the active
extension version. This supports both upgrades and extension rollbacks while
keeping the launcher/runtime contract compatible. It does not install the
integration automatically if you have never run the install command.

## How it works

Tower invokes the tool with the same contract as `git difftool --dir-diff`: it
hands over two directory trees for the whole changeset (`$LOCAL` = old,
`$REMOTE` = new) and calls the launcher once. The launcher opens a VS Code window
whose folder settings carry the two paths and blocks (via `--wait`) until you
close it, keeping the temp trees alive. When Git's parent process exposes the
compared revisions, the launcher resolves them to branch, tag, or remote-branch
names for the window title; otherwise it falls back to the repository name.

- **Mac** runs `bin/delta-flow` (bash) directly as the plist `LaunchScript`.
- **Windows** has no launch-script concept, so the JSON points `ApplicationPaths`
  at `powershell.exe` and passes `DiffToolArguments` that run `bin/delta-flow.ps1`
  — the PowerShell equivalent of the bash launcher.

## Manual install

If you'd rather not use the command (or want to see exactly what it does):

### Mac

1. Symlink the launcher into Tower's CompareTools directory:

   ```sh
   ln -sfn "$PWD/bin/delta-flow" \
     ~/Library/Application\ Support/com.fournova.Tower3/CompareTools/delta-flow.sh
   ```

2. Add the entry from `CompareTools-entry.plist` to the `<array>` in
   `~/Library/Application Support/com.fournova.Tower3/CompareTools/CompareTools.plist`
   (create the file with a top-level `<array>` if it doesn't exist). Keep any
   existing tool entries.

3. Validate: `plutil -lint .../CompareTools.plist`

4. Restart Tower, then Settings → Git → **Diff Tool** → *Delta Flow*.

### Windows

1. Copy `bin\delta-flow.ps1` into
   `%LOCALAPPDATA%\fournova\Tower\Settings\CompareTools\`.

2. Create `delta-flow.json` in that same folder. Replace the `-File` path with
   the **absolute** path to where you copied `delta-flow.ps1` (environment
   variables aren't reliably expanded inside `DiffToolArguments`, so spell it out):

   ```json
   {
     "DisplayName": "Delta Flow",
     "SupportsDiffChangeset": true,
     "SupportsDirectoryDiff": true,
     "DiffToolArguments": "-NoProfile -ExecutionPolicy Bypass -File \"C:\\Users\\<you>\\AppData\\Local\\fournova\\Tower\\Settings\\CompareTools\\delta-flow.ps1\" \"$LOCAL\" \"$REMOTE\"",
     "ApplicationPaths": [
       "%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
       "powershell.exe"
     ]
   }
   ```

3. Restart Tower, then Settings → Git → **Diff Tool** → *Delta Flow*.
