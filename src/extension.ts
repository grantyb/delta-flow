import * as vscode from 'vscode';
import { DiffContentProvider, SCHEME } from './contentProvider';
import { DiffView } from './diffView';
import { openExternalEntry } from './diffCommand';
import { TreeNode } from './fileTree';
import { loadChanges } from './gitDiff';
import { DiffSession, readSession } from './session';
import { installTowerIntegration } from './towerSetup';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Available in every window so users can run it from a normal VS Code session.
  context.subscriptions.push(
    vscode.commands.registerCommand('deltaFlow.installTowerIntegration', () => installTower(context)));
  const session = readSession();
  if (!session) {
    return; // Not a diff window — stay dormant.
  }
  registerContentProvider(context);
  const view = new DiffView(session);
  context.subscriptions.push(view);
  registerItemCommands(context, view);
  registerFilterCommands(context, view);
  await run(view, session);
}

function registerContentProvider(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(SCHEME, new DiffContentProvider()));
}

function registerItemCommands(context: vscode.ExtensionContext, view: DiffView): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('deltaFlow.activate', (node?: TreeNode) => view.activate(node)),
    vscode.commands.registerCommand('deltaFlow.openExternal', (node: TreeNode) =>
      node?.entry ? openExternalEntry(node.entry) : undefined));
}

function registerFilterCommands(context: vscode.ExtensionContext, view: DiffView): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('deltaFlow.setFilter', () =>
      promptFilter(view.patterns, (value) => view.setFilter(value))),
    vscode.commands.registerCommand('deltaFlow.searchChanges', () => promptSearch(view)),
    vscode.commands.registerCommand('deltaFlow.clearFilters', () => view.clearFilters()),
    vscode.commands.registerCommand('deltaFlow.collapseAll', () => view.collapseAll()),
    vscode.commands.registerCommand('deltaFlow.expandAll', () => view.expandAll()),
    vscode.commands.registerCommand('deltaFlow.next', () => view.selectNext()),
    vscode.commands.registerCommand('deltaFlow.previous', () => view.selectPrevious()),
    vscode.commands.registerCommand('deltaFlow.collapseOrParent', () => view.collapseOrParent()),
    vscode.commands.registerCommand('deltaFlow.expandOrChild', () => view.expandOrChild()),
    vscode.commands.registerCommand('deltaFlow.collapseSubtree', (node?: TreeNode) => view.collapseSubtree(node)),
    vscode.commands.registerCommand('deltaFlow.expandSubtree', (node?: TreeNode) => view.expandSubtree(node)));
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
  await focusView(); // Re-assert in case the startup layout restore stole focus.
}

/** Reveal Delta Flow so it's what you land on, not the Explorer. */
async function focusView(): Promise<void> {
  try {
    await vscode.commands.executeCommand('deltaFlow.changes.focus');
  } catch {
    // The view may not be ready during very early startup; a later call wins.
  }
}

async function installTower(context: vscode.ExtensionContext): Promise<void> {
  try {
    await installTowerIntegration(context.extensionPath);
    void vscode.window.showInformationMessage(
      'Tower integration installed. Restart Tower, then choose "Delta Flow" ' +
      'as your diff tool (Settings → Git Config).');
  } catch (err) {
    void vscode.window.showErrorMessage(
      `Could not install Tower integration: ${(err as Error).message}`);
  }
}

export function deactivate(): void {
  // Nothing to clean up; the launcher removes the temp workspace.
}
