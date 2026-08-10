import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { repoRoot } from './repo';
import { createSnapshot, difftoolArgs, ShowSnapshot, Snapshot } from './snapshotDiff';

const run = promisify(execFile);

/**
 * Opens the current repository's uncommitted changes (HEAD vs working tree,
 * including untracked non-ignored files) in the current window's Delta Flow view.
 */
export async function diffWorkingTree(extensionPath: string, show: ShowSnapshot): Promise<void> {
  const repo = await repoRoot();
  if (!repo) {
    void vscode.window.showErrorMessage('Delta Flow: open a folder that is a Git repository first.');
    return;
  }
  try {
    const snapshot = await diffWorkingTreeAgainst(extensionPath, repo, 'HEAD', 'Working Tree Changes');
    if (snapshot) {
      show(snapshot);
    } else {
      void vscode.window.showInformationMessage('Delta Flow: no working-tree changes to show.');
    }
  } catch (err) {
    void vscode.window.showErrorMessage(`Delta Flow: could not open the diff — ${(err as Error).message}`);
  }
}

/**
 * Snapshots the whole working state (HEAD plus every change, including untracked
 * files) and diffs it against `ref` — so the comparison shows the working
 * directory as the right-hand side. Returns undefined when they are identical.
 *
 * A throwaway index (GIT_INDEX_FILE) is loaded from HEAD and `git add -A`'d so it
 * captures the working state without touching the real index; `difftool --cached`
 * against `ref` then compares that state to `ref`.
 */
export async function diffWorkingTreeAgainst(
  extensionPath: string,
  repo: string,
  ref: string,
  workspaceName: string,
): Promise<Snapshot | undefined> {
  const indexFile = path.join(os.tmpdir(), `delta-flow-index-${process.pid}-${Date.now()}`);
  const env = { ...process.env, GIT_INDEX_FILE: indexFile, DELTA_FLOW_WORKSPACE_NAME: workspaceName };
  try {
    await captureWorkingTree(repo, env);
    const args = difftoolArgs(extensionPath, repo, [ref], ['--cached']);
    return await createSnapshot(args, env, () => fs.rm(indexFile, { force: true }));
  } finally {
    await fs.rm(indexFile, { force: true });
  }
}

/** Stage HEAD plus all working changes (including untracked) into the temp index. */
async function captureWorkingTree(repo: string, env: NodeJS.ProcessEnv): Promise<void> {
  await run('git', ['-C', repo, 'read-tree', 'HEAD'], { env });
  await run('git', ['-C', repo, 'add', '-A'], { env });
}
