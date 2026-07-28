import * as path from 'path';
import * as vscode from 'vscode';
import { DiffContentProvider, SCHEME } from './contentProvider';
import { DiffController } from './diffController';
import { openExternalEntry } from './diffCommand';
import { checkDirectory, completeDirectory, isGitRepository, pickDirectory } from './directoryCompare';
import { TreeNode } from './fileTree';
import { diffPullRequest, listOpenPullRequests, openPullRequest } from './pullRequests';
import { readSession } from './session';
import { ShowSnapshot } from './snapshotDiff';
import { WelcomeActions, WelcomePanel } from './welcomePanel';
import { StatusCategory } from './statusFilter';
import {
  installTowerIntegration,
  synchronizeTowerIntegrationIfNeeded,
  TOWER_INTEGRATION_VERSION,
  uninstallTowerIntegration,
} from './towerSetup';
import { diffWorkingTree } from './workingTree';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  void maintainTowerIntegration(context.extensionPath);
  const controller = new DiffController(context.extensionUri);
  context.subscriptions.push(controller);
  const show: ShowSnapshot = (snapshot) => void controller.show(snapshot.session, { ownedDir: snapshot.dir });

  // Available in every window so users can run them from a normal VS Code session.
  context.subscriptions.push(
    vscode.commands.registerCommand('deltaFlow.installTowerIntegration', () => installTower(context)),
    vscode.commands.registerCommand('deltaFlow.uninstallTowerIntegration', () => uninstallTower()),
    vscode.commands.registerCommand('deltaFlow.diffWorkingTree', () => diffWorkingTree(context.extensionPath, show)),
    vscode.commands.registerCommand('deltaFlow.diffPullRequest', () => diffPullRequest(context.extensionPath, show)));
  registerContentProvider(context);
  registerItemCommands(context, controller);
  registerFilterCommands(context, controller);
  // Registered in every window so "New Comparison" can always return to it.
  registerWelcome(context, show, controller);
  context.subscriptions.push(
    vscode.commands.registerCommand('deltaFlow.newComparison', () => controller.returnToWelcome()));

  const session = readSession();
  if (session) {
    // Opened directly on a launcher session folder (Tower or git difftool). The
    // launcher's --wait owns that session's cleanup, so the controller does not.
    void offerTrustGuidance(context);
    await controller.show(session);
  } else {
    await vscode.commands.executeCommand('setContext', 'deltaFlow.hasSession', false);
  }
}

const TRUST_HINT_DISMISSED = 'deltaFlow.trustHintDismissed';

/**
 * In Restricted Mode, invite the user to trust the shared sessions root once so
 * every future comparison opens trusted. Trusting this window alone would not
 * help, since each comparison opens in a fresh folder beneath that root.
 */
async function offerTrustGuidance(context: vscode.ExtensionContext): Promise<void> {
  if (vscode.workspace.isTrusted || context.globalState.get(TRUST_HINT_DISMISSED)) {
    return;
  }
  const sessionsRoot = sessionsRootPath();
  if (!sessionsRoot) {
    return; // Opened outside our launcher's layout — nothing specific to suggest.
  }
  const manage = 'Manage Trust';
  const dismiss = 'Don’t Show Again';
  const choice = await vscode.window.showInformationMessage(
    'Delta Flow opens each comparison in a new private working directory, which makes VS Code start ' +
    `in Restricted Mode. Add “${sessionsRoot}” (i.e. the 2nd ancestor of the current working directory) to your list of Trusted Folders to avoid the “Restricted Mode” banner in future.`,
    manage, dismiss);
  if (choice === manage) {
    await openTrustEditor();
  } else if (choice === dismiss) {
    await context.globalState.update(TRUST_HINT_DISMISSED, true);
  }
}

async function openTrustEditor(): Promise<void> {
  try {
    await vscode.commands.executeCommand('workbench.trust.manage');
  } catch {
    void vscode.window.showInformationMessage(
      'Run “Workspaces: Manage Workspace Trust” from the Command Palette, then ' +
      'add the folder under Trusted Folders.');
  }
}

/** The `.../delta-flow/sessions` root of the current window, if it is one of ours. */
function sessionsRootPath(): string | undefined {
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!folder) {
    return undefined;
  }
  const root = path.dirname(path.dirname(folder));
  const looksLikeOurs = path.basename(root) === 'sessions'
    && path.basename(path.dirname(root)) === 'delta-flow';
  return looksLikeOurs ? root : undefined;
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

/** Wire the empty-window sidebar to the working-tree, pull-request, and directory comparisons. */
function registerWelcome(context: vscode.ExtensionContext, show: ShowSnapshot, controller: DiffController): void {
  const actions: WelcomeActions = {
    isGitRepository: () => isGitRepository(),
    diffWorkingTree: () => void diffWorkingTree(context.extensionPath, show),
    loadPullRequests: () => listOpenPullRequests(),
    diffPullRequest: (pullRequest) => void openPullRequest(context.extensionPath, pullRequest, show),
    pickDirectory: (current) => pickDirectory(current),
    checkDirectory: (input) => checkDirectory(input),
    completeDirectory: (input) => completeDirectory(input),
    compareDirectories: (left, right) => void compareDirectories(controller, left, right),
  };
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('deltaFlow.welcome',
      new WelcomePanel(context.extensionUri, actions),
      { webviewOptions: { retainContextWhenHidden: true } }));
}

/** Show a read-only diff of two real directories in the current window. */
async function compareDirectories(controller: DiffController, leftInput: string, rightInput: string): Promise<void> {
  const [left, right] = await Promise.all([checkDirectory(leftInput), checkDirectory(rightInput)]);
  if (!left.path || !right.path) {
    void vscode.window.showErrorMessage('Delta Flow: choose two existing directories to compare.');
    return;
  }
  await controller.show({ left: left.path, right: right.path }, { respectGitignore: true });
}

function registerContentProvider(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(SCHEME, new DiffContentProvider()));
}

function registerItemCommands(context: vscode.ExtensionContext, controller: DiffController): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('deltaFlow.activate', (node?: TreeNode) => controller.current?.activate(node)),
    vscode.commands.registerCommand('deltaFlow.openExternal', (node: TreeNode) =>
      node?.entry ? openExternalEntry(node.entry) : undefined),
    vscode.commands.registerCommand('deltaFlow.revealCounterpart', (node?: TreeNode) =>
      controller.current?.revealCounterpart(node)));
}

/** [command-name suffix, status category] for the four title-bar status toggles. */
const STATUS_TOGGLES: [string, StatusCategory][] = [
  ['Added', 'A'], ['Modified', 'M'], ['Deleted', 'D'], ['Renamed', 'RC'],
];

function registerStatusToggles(context: vscode.ExtensionContext, controller: DiffController): void {
  for (const [name, category] of STATUS_TOGGLES) {
    const toggle = (): void => { controller.current?.toggleStatus(category); };
    context.subscriptions.push(
      vscode.commands.registerCommand(`deltaFlow.hide${name}`, toggle),
      vscode.commands.registerCommand(`deltaFlow.show${name}`, toggle));
  }
}

function registerFilterCommands(context: vscode.ExtensionContext, controller: DiffController): void {
  registerStatusToggles(context, controller);
  const view = (): DiffController['current'] => controller.current;
  context.subscriptions.push(
    vscode.commands.registerCommand('deltaFlow.focusPathFilter', () => view()?.focusFilter('path')),
    vscode.commands.registerCommand('deltaFlow.focusSearch', () => view()?.focusFilter('search')),
    vscode.commands.registerCommand('deltaFlow.collapseAll', () => view()?.collapseAll()),
    vscode.commands.registerCommand('deltaFlow.expandAll', () => view()?.expandAll()),
    vscode.commands.registerCommand('deltaFlow.next', () => view()?.selectNext()),
    vscode.commands.registerCommand('deltaFlow.previous', () => view()?.selectPrevious()),
    vscode.commands.registerCommand('deltaFlow.collapseOrParent', () => view()?.collapseOrParent()),
    vscode.commands.registerCommand('deltaFlow.expandOrChild', () => view()?.expandOrChild()),
    vscode.commands.registerCommand('deltaFlow.collapseSubtree', (node?: TreeNode) => view()?.collapseSubtree(node)),
    vscode.commands.registerCommand('deltaFlow.expandSubtree', (node?: TreeNode) => view()?.expandSubtree(node)));
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

async function uninstallTower(): Promise<void> {
  const uninstall = 'Uninstall';
  const selected = await vscode.window.showWarningMessage(
    'Remove Delta Flow from Tower’s configured diff tools?',
    { modal: true },
    uninstall);
  if (selected !== uninstall) {
    return;
  }
  try {
    const status = await uninstallTowerIntegration();
    const message = status === 'removed'
      ? 'Tower integration removed. Restart Tower to refresh its diff-tool list.'
      : 'Delta Flow: no Tower integration was installed.';
    void vscode.window.showInformationMessage(message);
  } catch (err) {
    void vscode.window.showErrorMessage(
      `Could not remove Tower integration: ${(err as Error).message}`);
  }
}

export function deactivate(): void {
  // The DiffController is a subscription; disposing it removes any snapshot it
  // owns (via a detached process, so window teardown is never held up).
}
