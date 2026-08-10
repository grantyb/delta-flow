import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { repoRoot } from './repo';
import { createSnapshot, difftoolArgs, ShowSnapshot } from './snapshotDiff';

const run = promisify(execFile);

/**
 * Opens the current repository's uncommitted changes (HEAD vs working tree,
 * including untracked non-ignored files) in the current window's Delta Flow view.
 *
 * A throwaway index (GIT_INDEX_FILE) is loaded from HEAD and `git add -A`'d so it
 * captures the whole working state without touching the real index; difftool
 * --cached against it then shows every change, untracked files included. The
 * launcher is wired in via an inline -c config so it works regardless of the
 * user's global diff.tool.
 */
export async function diffWorkingTree(extensionPath: string, show: ShowSnapshot): Promise<void> {
  const repo = await repoRoot();
  if (!repo) {
    void vscode.window.showErrorMessage('Delta Flow: open a folder that is a Git repository first.');
    return;
  }
  const indexFile = path.join(os.tmpdir(), `delta-flow-index-${process.pid}-${Date.now()}`);
  const env = { ...process.env, GIT_INDEX_FILE: indexFile, DELTA_FLOW_WORKSPACE_NAME: 'Working Tree Changes' };
  try {
    await captureWorkingTree(repo, env);
    if (!(await hasChanges(repo, env))) {
      void vscode.window.showInformationMessage('Delta Flow: no working-tree changes to show.');
      return;
    }
    const args = difftoolArgs(extensionPath, repo, ['HEAD'], ['--cached']);
    show(await createSnapshot(args, env, () => fs.rm(indexFile, { force: true })));
  } catch (err) {
    void vscode.window.showErrorMessage(`Delta Flow: could not open the diff — ${(err as Error).message}`);
  } finally {
    await fs.rm(indexFile, { force: true });
  }
}

/** Stage HEAD plus all working changes (including untracked) into the temp index. */
async function captureWorkingTree(repo: string, env: NodeJS.ProcessEnv): Promise<void> {
  await run('git', ['-C', repo, 'read-tree', 'HEAD'], { env });
  await run('git', ['-C', repo, 'add', '-A'], { env });
}

/** `git diff --cached --quiet` exits 1 when the temp index differs from HEAD. */
async function hasChanges(repo: string, env: NodeJS.ProcessEnv): Promise<boolean> {
  try {
    await run('git', ['-C', repo, 'diff', '--cached', '--quiet', 'HEAD'], { env });
    return false;
  } catch (err) {
    return (err as { code?: number }).code === 1;
  }
}
