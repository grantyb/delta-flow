# Tower integration

Tower for Mac does **not** use git's `diff.tool` config. It has its own plugin
system: a `CompareTools.plist` plus a launch script under

```
~/Library/Application Support/com.fournova.Tower3/CompareTools/
```

Tower invokes the launch script with the same contract as `git difftool`:

```
diff mode:   <script> $LOCAL $REMOTE [$RELATIVE_PATH]
merge mode:  <script> $LOCAL $REMOTE $BASE $MERGE_RESULT
```

With `SupportsDiffChangeset` set to `true`, Tower passes `$LOCAL`/`$REMOTE` as two
directory trees for the whole changeset and calls the script once — identical to
`git difftool --dir-diff`. So `bin/delta-flow` doubles as the Tower launch script
with no changes.

## Install

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
   Because the tool supports changesets, the "Perform Directory Diff" checkbox is
   not needed.
