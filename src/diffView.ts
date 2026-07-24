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

  get include(): string {
    return this.filter.include;
  }

  get exclude(): string {
    return this.filter.exclude;
  }

  populate(changes: ChangeSet): void {
    this.changes = changes;
    this.render();
  }

  setInclude(include: string): void {
    this.filter = new PathFilter(include, this.filter.exclude);
    this.render();
  }

  setExclude(exclude: string): void {
    this.filter = new PathFilter(this.filter.include, exclude);
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
