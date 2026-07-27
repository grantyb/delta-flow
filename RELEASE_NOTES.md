# Release notes

## 0.1.1

### Review GitHub pull requests

- Run **Delta Flow: Diff Pull Request** to list the repository’s open pull
  requests (requires `gh`).
- Compare the PR head with its target branch in a focused Delta Flow window.
- See the PR number, title, author, draft status, source branch, and target
  branch in the picker.
- PRs targeting the checked-out branch are marked and prioritised.
- Optionally group the picker by author, draft status, or target branch with
  `deltaFlow.pullRequestGrouping`.
- Get a clear installation prompt, authentication command, and link when the
  GitHub CLI (`gh`) is unavailable.

![Choosing and opening a GitHub pull request in Delta Flow](media/delta-flow-pr-demo.gif)

The PR picker requires an installed and authenticated
[GitHub CLI](https://cli.github.com/). Run `gh auth login` after installation.

### More useful comparison windows

- PR windows use descriptive titles containing the PR number, title, author,
  and draft status.
- Working-tree comparisons are titled **Working Tree Changes**.
- Tower and direct `git difftool` comparisons resolve branch, tag, remote
  branch, or commit names when Git exposes them, with a repository-name
  fallback.
- Delta Flow now opens a named folder rather than a `.code-workspace` file, so
  VS Code no longer appends “(Workspace)” to comparison titles.

### Improved session file management

- Comparison sessions now live beneath one stable per-user cache root:
  `.../delta-flow/sessions`.
- Session launchers sweep sessions older than three days, and uninstalling the
  extension removes the remaining Delta Flow session cache.

### Smoother Workspace Trust (Restricted Mode)

- Although Delta Flow remains fully functional in Restricted Mode, we now give
  some guidance about how to remove the banner.
- A one-time in-product hint links directly to Workspace Trust management.

### Tower integration lifecycle

- Installed Tower launchers support upgrades and extension
  rollbacks.
- **Delta Flow: Uninstall Tower Integration** removes Delta Flow’s Tower
  registration and launcher.
- Uninstalling the VS Code extension also removes the Tower integration after
  VS Code restarts.

