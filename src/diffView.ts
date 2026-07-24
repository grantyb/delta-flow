import * as vscode from 'vscode';
import { ChangeSet } from './changeModel';
import { PathFilter } from './filter';
import { TreeNode } from './fileTree';
import { ChangesTreeProvider } from './treeProvider';

/** Owns the sidebar tree, its provider, the active filter, and their display states. */
export class DiffView {
  private readonly provider = new ChangesTreeProvider();
  private readonly view: vscode.TreeView<TreeNode>;
  private changes = new ChangeSet([]);
  private filter = new PathFilter();

  constructor() {
    this.view = vscode.window.createTreeView('gitDirDiff.changes', {
      treeDataProvider: this.provider,
      showCollapseAll: false,
    });
    this.view.message = 'Loading changes…';
    // Expanding a folder means the tree is no longer fully collapsed.
    this.view.onDidExpandElement(() => this.setCollapsedContext(false));
    this.setCollapsedContext(false);
  }

  get patterns(): string {
    return this.filter.patterns;
  }

  populate(changes: ChangeSet): void {
    this.changes = changes;
    this.render();
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

  dispose(): void {
    this.view.dispose();
  }

  private render(): void {
    const filtered = new ChangeSet(this.changes.entries.filter((e) => this.filter.keep(e)));
    this.provider.setChanges(filtered);
    this.view.description = this.filter.isActive ? this.filter.summary() : undefined;
    this.view.message = this.messageFor(filtered);
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
