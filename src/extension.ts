import * as vscode from 'vscode';
import { ChangeEntry } from './changeModel';
import { DiffContentProvider, SCHEME } from './contentProvider';
import { openDiff } from './diffCommand';
import { loadChanges } from './gitDiff';
import { readSession } from './session';
import { ChangesTreeProvider } from './treeProvider';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const session = readSession();
  if (!session) {
    return; // Not a diff window — stay dormant.
  }
  registerContentProvider(context);
  registerOpenCommand(context);
  await showChanges(context, session);
}

function registerContentProvider(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(SCHEME, new DiffContentProvider()));
}

function registerOpenCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('gitDirDiff.openDiff', (entry: ChangeEntry) => openDiff(entry)));
}

async function showChanges(context: vscode.ExtensionContext, session: ReturnType<typeof readSession>): Promise<void> {
  const changes = await loadChanges(session!);
  const provider = new ChangesTreeProvider(changes);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('gitDirDiff.changes', provider));
  await vscode.commands.executeCommand('gitDirDiff.changes.focus');
}

export function deactivate(): void {
  // Nothing to clean up; the launcher removes the temp workspace.
}
