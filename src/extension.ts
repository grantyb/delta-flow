import * as vscode from 'vscode';
import { DiffContentProvider, SCHEME } from './contentProvider';
import { DiffView } from './diffView';
import { openExternalEntry } from './diffCommand';
import { TreeNode } from './fileTree';
import { loadChanges } from './gitDiff';
import { diffPullRequest } from './pullRequests';
import { DiffSession, readSession } from './session';
import { StatusCategory } from './statusFilter';
import {
  installTowerIntegration,
  synchronizeTowerIntegrationIfNeeded,
  TOWER_INTEGRATION_VERSION,
} from './towerSetup';
import { diffWorkingTree } from './workingTree';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  void maintainTowerIntegration(context.extensionPath);
  // Available in every window so users can run them from a normal VS Code session.
  context.subscriptions.push(
    vscode.commands.registerCommand('deltaFlow.installTowerIntegration', () => installTower(context)),
    vscode.commands.registerCommand('deltaFlow.diffWorkingTree', () => diffWorkingTree(context.extensionPath)),
    vscode.commands.registerCommand('deltaFlow.diffPullRequest', () => diffPullRequest(context.extensionPath)));
  const session = readSession();
  if (!session) {
    return; // Not a diff window — stay dormant.
  }
  registerContentProvider(context);
  const view = new DiffView(session, context.extensionUri);
  context.subscriptions.push(view);
  registerItemCommands(context, view);
  registerFilterCommands(context, view);
  await run(view, session);
}

async function maintainTowerIntegration(extensionPath: string): Promise<void> {
  try {
    const status = await synchronizeTowerIntegrationIfNeeded(extensionPath);
    if (status === 'synchronized') {
      void vscode.window.showInformationMessage(
        `Delta Flow: Tower integration synchronized to version ${TOWER_INTEGRATION_VERSION}.`);
    }
  } catch (err) {
    void vscode.window.showWarningMessage(
      `Delta Flow: could not update the Tower integration — ${(err as Error).message}`);
  }
}

function registerContentProvider(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(SCHEME, new DiffContentProvider()));
}

function registerItemCommands(context: vscode.ExtensionContext, view: DiffView): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('deltaFlow.activate', (node?: TreeNode) => view.activate(node)),
    vscode.commands.registerCommand('deltaFlow.openExternal', (node: TreeNode) =>
      node?.entry ? openExternalEntry(node.entry) : undefined),
    vscode.commands.registerCommand('deltaFlow.revealCounterpart', (node?: TreeNode) =>
      view.revealCounterpart(node)));
}

/** [command-name suffix, status category] for the four title-bar status toggles. */
const STATUS_TOGGLES: [string, StatusCategory][] = [
  ['Added', 'A'], ['Modified', 'M'], ['Deleted', 'D'], ['Renamed', 'RC'],
];

function registerStatusToggles(context: vscode.ExtensionContext, view: DiffView): void {
  for (const [name, category] of STATUS_TOGGLES) {
    const toggle = (): void => view.toggleStatus(category);
    context.subscriptions.push(
      vscode.commands.registerCommand(`deltaFlow.hide${name}`, toggle),
      vscode.commands.registerCommand(`deltaFlow.show${name}`, toggle));
  }
}

function registerFilterCommands(context: vscode.ExtensionContext, view: DiffView): void {
  registerStatusToggles(context, view);
  context.subscriptions.push(
    vscode.commands.registerCommand('deltaFlow.focusPathFilter', () => view.focusFilter('path')),
    vscode.commands.registerCommand('deltaFlow.focusSearch', () => view.focusFilter('search')),
    vscode.commands.registerCommand('deltaFlow.collapseAll', () => view.collapseAll()),
    vscode.commands.registerCommand('deltaFlow.expandAll', () => view.expandAll()),
    vscode.commands.registerCommand('deltaFlow.next', () => view.selectNext()),
    vscode.commands.registerCommand('deltaFlow.previous', () => view.selectPrevious()),
    vscode.commands.registerCommand('deltaFlow.collapseOrParent', () => view.collapseOrParent()),
    vscode.commands.registerCommand('deltaFlow.expandOrChild', () => view.expandOrChild()),
    vscode.commands.registerCommand('deltaFlow.collapseSubtree', (node?: TreeNode) => view.collapseSubtree(node)),
    vscode.commands.registerCommand('deltaFlow.expandSubtree', (node?: TreeNode) => view.expandSubtree(node)));
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
