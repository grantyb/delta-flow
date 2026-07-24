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
  private suppressOpenOnce = false;

  constructor() {
    this.view = vscode.window.createTreeView('gitDirDiff.changes', {
      treeDataProvider: this.provider,
      showCollapseAll: false,
    });
    this.view.message = 'Loading changes…';
    this.disposables.push(
      // Selection fires for both clicks and cursor-key navigation.
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
    this.apply();
  }

  setFilter(patterns: string): void {
    this.filter = new PathFilter(patterns);
    this.apply();
  }

  clearFilters(): void {
    this.filter = new PathFilter();
    this.apply();
  }

  collapseAll(): void {
    this.provider.setCollapsed(true);
    this.setCollapsedContext(true);
  }

  expandAll(): void {
    this.provider.setCollapsed(false);
    this.setCollapsedContext(false);
  }

  dispose(): void {
    this.cancelPendingOpen();
    this.disposables.forEach((d) => d.dispose());
    this.view.dispose();
  }

  /** Loads a file's diff when it becomes selected, debounced for held cursor keys. */
  private onSelectionChanged(selection: readonly TreeNode[]): void {
    this.cancelPendingOpen();
    if (this.suppressOpenOnce) {
      this.suppressOpenOnce = false;
      return; // The seeded selection shouldn't auto-open a multi-file changeset.
    }
    const node = selection[0];
    if (node?.kind === 'file' && node.entry) {
      this.scheduleOpen(node.entry);
    }
  }

  private scheduleOpen(entry: ChangeEntry): void {
    this.pendingOpen = setTimeout(() => void openDiff(entry), OPEN_DEBOUNCE_MS);
  }

  private cancelPendingOpen(): void {
    if (this.pendingOpen) {
      clearTimeout(this.pendingOpen);
      this.pendingOpen = undefined;
    }
  }

  private apply(): void {
    this.render();
    void this.seedSelection();
  }

  private render(): void {
    this.visible = new ChangeSet(this.changes.entries.filter((e) => this.filter.keep(e)));
    this.provider.setChanges(this.visible);
    this.view.description = this.filter.isActive ? this.filter.summary() : undefined;
    this.view.message = this.messageFor(this.visible);
  }

  /**
   * Selects the first file so focus === selection; VS Code then moves selection
   * with focus as you cursor (workbench.list.selectionFollowsFocus), loading each
   * diff. Only auto-opens when a single file is shown.
   */
  private async seedSelection(): Promise<void> {
    const first = this.provider.firstFile();
    if (!first) {
      return;
    }
    this.suppressOpenOnce = this.visible.entries.length > 1;
    await this.view.reveal(first, { select: true, focus: true });
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
