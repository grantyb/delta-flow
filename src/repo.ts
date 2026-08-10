import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const run = promisify(execFile);

/** The git repo containing the active editor, or the first workspace folder. */
export async function repoRoot(): Promise<string | undefined> {
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

/** The checked-out branch, or undefined when detached or unavailable. */
export async function currentBranch(repo: string): Promise<string | undefined> {
  try {
    const { stdout } = await run('git', ['-C', repo, 'branch', '--show-current']);
    return stdout.trim() || undefined;
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
