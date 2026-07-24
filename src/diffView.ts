import * as vscode from 'vscode';
import { ChangeEntry, ChangeSet } from './changeModel';
import { openDiff } from './diffCommand';
import { PathFilter } from './filter';
import { TreeNode } from './fileTree';
import { ChangesTreeProvider } from './treeProvider';

/** How long to wait after a selection settles before loading its diff. */
const OPEN_DEBOUNCE_MS = 150;

/** Owns the sidebar tree, its provider, the active filter, and their display states. */
export class DiffView {
  private readonly provider = new ChangesTreeProvider();
  private readonly view: vscode.TreeView<TreeNode>;
  private readonly disposables: vscode.Disposable[] = [];
  private changes = new ChangeSet([]);
  private visible = new ChangeSet([]);
  private filter = new PathFilter();
  private pendingOpen?: ReturnType<typeof setTimeout>;
  private currentFile?: TreeNode;

  constructor() {
    this.view = vscode.window.createTreeView('gitDirDiff.changes', {
      treeDataProvider: this.provider,
      showCollapseAll: false,
    });
    this.view.message = 'Loading changes…';
    this.disposables.push(
      // Clicks change selection directly; cursor keys are handled by next/prev.
      this.view.onDidChangeSelection((e) => this.onSelectionChanged(e.selection)),
      // Expanding a folder means the tree is no longer fully collapsed.
      this.view.onDidExpandElement(() => this.setCollapsedContext(false)));
    this.setCollapsedContext(false);
  }

  get patterns(): string {
    return this.filter.patterns;
  }

  populate(changes: ChangeSet): void {
    this.changes = changes;
    this.render();
    this.autoOpenSingle();
  }

  setFilter(patterns: string): void {
    this.filter = new PathFilter(patterns);
    this.render();
  }

  clearFilters(): void {
    this.filter = new PathFilter();
    this.render();
  }

  collapseAll(): void {
    this.provider.setCollapsed(true);
    this.setCollapsedContext(true);
  }

  expandAll(): void {
    this.provider.setCollapsed(false);
    this.setCollapsedContext(false);
  }

  selectNext(): void {
    void this.step(1);
  }

  selectPrevious(): void {
    void this.step(-1);
  }

  dispose(): void {
    this.cancelPendingOpen();
    this.disposables.forEach((d) => d.dispose());
    this.view.dispose();
  }

  /** Clicking a file selects it directly; load its diff (debounced). */
  private onSelectionChanged(selection: readonly TreeNode[]): void {
    const node = selection[0];
    if (node?.kind === 'file' && node.entry) {
      this.currentFile = node;
      this.scheduleOpen(node.entry);
    }
  }

  /** Moves selection to the next/previous file and loads its diff. */
  private async step(delta: number): Promise<void> {
    const files = this.provider.orderedFiles();
    if (files.length === 0) {
      return;
    }
    const current = this.currentFile ? files.indexOf(this.currentFile) : -1;
    const target = files[clamp(current + delta, 0, files.length - 1)];
    await this.select(target);
  }

  private async select(node: TreeNode): Promise<void> {
    this.currentFile = node;
    await this.view.reveal(node, { select: true, focus: true });
    if (node.entry) {
      this.scheduleOpen(node.entry);
    }
  }

  private scheduleOpen(entry: ChangeEntry): void {
    this.cancelPendingOpen();
    this.pendingOpen = setTimeout(() => void openDiff(entry), OPEN_DEBOUNCE_MS);
  }

  private cancelPendingOpen(): void {
    if (this.pendingOpen) {
      clearTimeout(this.pendingOpen);
      this.pendingOpen = undefined;
    }
  }

  private render(): void {
    this.visible = new ChangeSet(this.changes.entries.filter((e) => this.filter.keep(e)));
    this.provider.setChanges(this.visible);
    this.view.description = this.filter.isActive ? this.filter.summary() : undefined;
    this.view.message = this.messageFor(this.visible);
  }

  /** Open the diff automatically only when a single file changed. */
  private autoOpenSingle(): void {
    const files = this.provider.orderedFiles();
    if (files.length === 1) {
      void this.select(files[0]);
    }
  }

  private messageFor(filtered: ChangeSet): string | undefined {
    if (this.changes.isEmpty) {
      return 'No changes found.';
    }
    if (filtered.isEmpty) {
      return 'No files match the current filter.';
    }
    return undefined;
  }

  /** Drives which of the Collapse All / Expand All title buttons is shown. */
  private setCollapsedContext(collapsed: boolean): void {
    void vscode.commands.executeCommand('setContext', 'gitDirDiff.collapsed', collapsed);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
