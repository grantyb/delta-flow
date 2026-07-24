import * as vscode from 'vscode';
import { DiffContentProvider, SCHEME } from './contentProvider';
import { DiffView } from './diffView';
import { openExternalEntry } from './diffCommand';
import { TreeNode } from './fileTree';
import { loadChanges } from './gitDiff';
import { DiffSession, readSession } from './session';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const session = readSession();
  if (!session) {
    return; // Not a diff window — stay dormant.
  }
  registerContentProvider(context);
  registerItemCommands(context);
  const view = new DiffView(session);
  context.subscriptions.push(view);
  registerFilterCommands(context, view);
  await run(view, session);
}

function registerContentProvider(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(SCHEME, new DiffContentProvider()));
}

function registerItemCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('gitDirDiff.openExternal', (node: TreeNode) =>
      node?.entry ? openExternalEntry(node.entry) : undefined));
}

function registerFilterCommands(context: vscode.ExtensionContext, view: DiffView): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('gitDirDiff.setFilter', () =>
      promptFilter(view.patterns, (value) => view.setFilter(value))),
    vscode.commands.registerCommand('gitDirDiff.searchChanges', () => promptSearch(view)),
    vscode.commands.registerCommand('gitDirDiff.clearFilters', () => view.clearFilters()),
    vscode.commands.registerCommand('gitDirDiff.collapseAll', () => view.collapseAll()),
    vscode.commands.registerCommand('gitDirDiff.expandAll', () => view.expandAll()),
    vscode.commands.registerCommand('gitDirDiff.next', () => view.selectNext()),
    vscode.commands.registerCommand('gitDirDiff.previous', () => view.selectPrevious()),
    vscode.commands.registerCommand('gitDirDiff.collapseOrParent', () => view.collapseOrParent()),
    vscode.commands.registerCommand('gitDirDiff.expandOrChild', () => view.expandOrChild()),
    vscode.commands.registerCommand('gitDirDiff.collapseSubtree', (node?: TreeNode) => view.collapseSubtree(node)),
    vscode.commands.registerCommand('gitDirDiff.expandSubtree', (node?: TreeNode) => view.expandSubtree(node)));
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

async function promptSearch(view: DiffView): Promise<void> {
  const value = await vscode.window.showInputBox({
    title: 'Search changes',
    prompt: 'Regex matched against added/removed lines (git -G). Empty to clear.',
    value: view.searchText,
    ignoreFocusOut: true,
  });
  if (value !== undefined) {
    await view.setSearch(value);
  }
}

async function run(view: DiffView, session: DiffSession): Promise<void> {
  await focusView();
  const changes = await loadChanges(session);
  view.populate(changes);
}

/** Reveal and expand our Changed Files section within the Explorer viewlet. */
async function focusView(): Promise<void> {
  try {
    await vscode.commands.executeCommand('gitDirDiff.changes.focus');
  } catch {
    // The view may not be ready during very early startup; a later call wins.
  }
}

export function deactivate(): void {
  // Nothing to clean up; the launcher removes the temp workspace.
}
