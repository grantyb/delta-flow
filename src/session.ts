import * as vscode from 'vscode';
import * as path from 'path';

/** The pair of temp directories git difftool --dir-diff hands to the tool. */
export interface DiffSession {
  left: string;
  right: string;
}

/** Reads the diff session injected into workspace settings by the launcher. */
export function readSession(): DiffSession | undefined {
  const raw = vscode.workspace.getConfiguration('deltaFlow').get<DiffSession>('session');
  if (!raw || !raw.left || !raw.right) {
    return undefined;
  }
  const base = sessionBaseDir();
  return { left: resolvePath(raw.left, base), right: resolvePath(raw.right, base) };
}

/** Real sessions carry absolute temp paths; fixtures may be relative to the workspace. */
function resolvePath(target: string, base: string | undefined): string {
  if (path.isAbsolute(target) || !base) {
    return target;
  }
  return path.join(base, target);
}

function sessionBaseDir(): string | undefined {
  const workspaceFile = vscode.workspace.workspaceFile;
  if (workspaceFile && workspaceFile.scheme === 'file') {
    return path.dirname(workspaceFile.fsPath);
  }
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}
