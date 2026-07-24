import * as vscode from 'vscode';
import { ChangeEntry, ChangeSet } from './changeModel';
import { DiffContentProvider, SCHEME } from './contentProvider';
import { DiffView } from './diffView';
import { openDiff, openExternalEntry } from './diffCommand';
import { TreeNode } from './fileTree';
import { loadChanges } from './gitDiff';
import { DiffSession, readSession } from './session';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const session = readSession();
  if (!session) {
    return; // Not a diff window — stay dormant.
  }
  registerContentProvider(context);
  registerOpenCommand(context);
  const view = new DiffView();
  context.subscriptions.push(view);
  registerFilterCommands(context, view);
  await run(view, session);
}

function registerContentProvider(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(SCHEME, new DiffContentProvider()));
}

function registerOpenCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('gitDirDiff.openDiff', (entry: ChangeEntry) => openDiff(entry)),
    vscode.commands.registerCommand('gitDirDiff.openExternal', (node: TreeNode) =>
      node?.entry ? openExternalEntry(node.entry) : undefined));
}

function registerFilterCommands(context: vscode.ExtensionContext, view: DiffView): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('gitDirDiff.setFilter', () =>
      promptFilter(view.patterns, (value) => view.setFilter(value))),
    vscode.commands.registerCommand('gitDirDiff.clearFilters', () => view.clearFilters()));
}

async function promptFilter(current: string, apply: (value: string) => void): Promise<void> {
  const value = await vscode.window.showInputBox({
    title: 'Filter paths',
    prompt: 'Comma-separated; prefix with ! to exclude. e.g. *.java, *.jsp, !**/target/**',
    value: current,
    ignoreFocusOut: true,
  });
  if (value !== undefined) {
    apply(value);
  }
}

async function run(view: DiffView, session: DiffSession): Promise<void> {
  await focusView();
  const changes = await loadChanges(session);
  view.populate(changes);
  await focusView(); // Re-assert in case the startup layout restore stole focus.
  await openFirst(changes);
}

/** Reveal and expand our Changed Files section within the Explorer viewlet. */
async function focusView(): Promise<void> {
  try {
    await vscode.commands.executeCommand('gitDirDiff.changes.focus');
  } catch {
    // The view may not be ready during very early startup; a later call wins.
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
