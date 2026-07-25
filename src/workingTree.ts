import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const run = promisify(execFile);

/**
 * Opens the current repository's uncommitted changes (HEAD vs working tree) in a
 * new Delta Flow window, via git difftool --dir-diff with our launcher wired in
 * inline so it works regardless of the user's configured diff.tool.
 */
export async function diffWorkingTree(extensionPath: string): Promise<void> {
  const repo = await repoRoot();
  if (!repo) {
    void vscode.window.showErrorMessage('Delta Flow: open a folder that is a Git repository first.');
    return;
  }
  if (!(await hasChanges(repo))) {
    void vscode.window.showInformationMessage('Delta Flow: no working-tree changes to show.');
    return;
  }
  launchDiff(extensionPath, repo);
}

/** The git repo containing the active editor, or the first workspace folder. */
async function repoRoot(): Promise<string | undefined> {
  const cwd = candidateDir();
  if (!cwd) {
    return undefined;
  }
  try {
    const { stdout } = await run('git', ['-C', cwd, 'rev-parse', '--show-toplevel']);
    return stdout.trim();
  } catch {
    return undefined;
  }
}

function candidateDir(): string | undefined {
  const active = vscode.window.activeTextEditor?.document.uri;
  if (active?.scheme === 'file') {
    return vscode.workspace.getWorkspaceFolder(active)?.uri.fsPath ?? path.dirname(active.fsPath);
  }
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

/** `git diff --quiet` exits 1 when there are changes vs HEAD, 0 when clean. */
async function hasChanges(repo: string): Promise<boolean> {
  try {
    await run('git', ['-C', repo, 'diff', '--quiet', 'HEAD']);
    return false;
  } catch (err) {
    return (err as { code?: number }).code === 1;
  }
}

function launchDiff(extensionPath: string, repo: string): void {
  const launcher = path.join(extensionPath, 'bin', 'delta-flow');
  const cmd = `"${launcher}" "$LOCAL" "$REMOTE"`;
  const args = ['-C', repo,
    '-c', `difftool.deltaFlowInline.cmd=${cmd}`,
    '-c', 'difftool.prompt=false',
    'difftool', '--dir-diff', '--no-prompt', '-t', 'deltaFlowInline', 'HEAD'];
  execFile('git', args, (err) => {
    if (err) {
      void vscode.window.showErrorMessage(`Delta Flow: could not open the diff — ${err.message}`);
    }
  });
}
