import * as vscode from 'vscode';

/** The pair of temp directories git difftool --dir-diff hands to the tool. */
export interface DiffSession {
  left: string;
  right: string;
}

/** Reads the diff session injected into workspace settings by the launcher. */
export function readSession(): DiffSession | undefined {
  const session = vscode.workspace.getConfiguration('gitDirDiff').get<DiffSession>('session');
  if (!session || !session.left || !session.right) {
    return undefined;
  }
  return session;
}
