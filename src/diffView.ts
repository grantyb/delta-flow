import * as vscode from 'vscode';
import { ChangeSet } from './changeModel';
import { PathFilter } from './filter';
import { ChangesTreeProvider } from './treeProvider';

/** Owns the sidebar tree, its provider, the active filter, and their display states. */
export class DiffView {
  private readonly provider = new ChangesTreeProvider();
  private readonly view: vscode.TreeView<unknown>;
  private changes = new ChangeSet([]);
  private filter = new PathFilter();

  constructor() {
    this.view = vscode.window.createTreeView('gitDirDiff.changes', {
      treeDataProvider: this.provider,
      showCollapseAll: true,
    });
    this.view.message = 'Loading changes…';
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
}
