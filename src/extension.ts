import * as vscode from 'vscode';
import { ChangeEntry, ChangeSet } from './changeModel';
import { DiffContentProvider, SCHEME } from './contentProvider';
import { DiffView } from './diffView';
import { openDiff } from './diffCommand';
import { loadChanges } from './gitDiff';
import { DiffSession, readSession } from './session';

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

async function showChanges(context: vscode.ExtensionContext, session: DiffSession): Promise<void> {
  const view = new DiffView();
  context.subscriptions.push(view);
  await revealContainer();
  const changes = await loadChanges(session);
  view.populate(changes);
  await revealContainer(); // Re-assert in case the startup layout restore stole focus.
  await openFirst(changes);
}

/** Bring our activity-bar container to the front so the diff view is what you see. */
async function revealContainer(): Promise<void> {
  try {
    await vscode.commands.executeCommand('workbench.view.extension.gitDirDiff');
  } catch {
    // The container may not be ready during very early startup; a later call wins.
  }
}

async function openFirst(changes: ChangeSet): Promise<void> {
  const first = changes.entries[0];
  if (first) {
    await openDiff(first);
  }
}

export function deactivate(): void {
  // Nothing to clean up; the launcher removes the temp workspace.
}
