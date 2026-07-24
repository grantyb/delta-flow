import * as vscode from 'vscode';
import { ChangeSet } from './changeModel';
import { DiffLoader } from './diffLoader';
import { PathFilter } from './filter';
import { TreeNode } from './fileTree';
import { ChangesTreeProvider } from './treeProvider';

/** Throttle window for loading diffs while navigating. */
const OPEN_THROTTLE_MS = 150;

/** Owns the sidebar tree, its provider, the active filter, and their display states. */
export class DiffView {
  private readonly provider = new ChangesTreeProvider();
  private readonly view: vscode.TreeView<TreeNode>;
  private readonly loader = new DiffLoader(OPEN_THROTTLE_MS);
  private readonly disposables: vscode.Disposable[] = [];
  private changes = new ChangeSet([]);
  private visible = new ChangeSet([]);
  private filter = new PathFilter();
  private current?: TreeNode;

  constructor() {
    this.view = vscode.window.createTreeView('gitDirDiff.changes', {
      treeDataProvider: this.provider,
      showCollapseAll: false,
    });
    this.view.message = 'Loading changes…';
    this.disposables.push(
      this.view.onDidChangeSelection((e) => this.onSelectionChanged(e.selection)),
      this.view.onDidCollapseElement((e) => this.provider.onCollapsed(e.element)),
      this.view.onDidExpandElement((e) => this.onExpanded(e.element)));
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
    this.provider.collapseAll();
    this.setCollapsedContext(true);
  }

  expandAll(): void {
    this.provider.expandAll();
    this.setCollapsedContext(false);
  }

  selectNext(): void {
    void this.step(1);
  }

  selectPrevious(): void {
    void this.step(-1);
  }

  dispose(): void {
    this.loader.dispose();
    this.disposables.forEach((d) => d.dispose());
    this.view.dispose();
  }

  /** Clicks (and our own reveals) land here; load the diff when a file is selected. */
  private onSelectionChanged(selection: readonly TreeNode[]): void {
    this.load(selection[0]);
  }

  /** Moves selection to the next/previous visible row and loads it if it's a file. */
  private async step(delta: number): Promise<void> {
    const rows = this.provider.visibleRows();
    if (rows.length === 0) {
      return;
    }
    const index = this.current ? rows.indexOf(this.current) : -1;
    await this.selectAndLoad(rows[clamp(index + delta, 0, rows.length - 1)]);
  }

  private async selectAndLoad(node: TreeNode): Promise<void> {
    await this.view.reveal(node, { select: true, focus: true });
    this.load(node);
  }

  private load(node?: TreeNode): void {
    this.current = node;
    if (node?.kind === 'file' && node.entry) {
      this.loader.request(node.entry);
    } else {
      this.loader.cancel();
    }
  }

  private onExpanded(node: TreeNode): void {
    this.provider.onExpanded(node);
    this.setCollapsedContext(false);
  }

  private render(): void {
    this.visible = new ChangeSet(this.changes.entries.filter((e) => this.filter.keep(e)));
    this.provider.setChanges(this.visible);
    this.view.description = this.filter.isActive ? this.filter.summary() : undefined;
    this.view.message = this.messageFor(this.visible);
  }

  /** Open the diff automatically only when a single file changed. */
  private autoOpenSingle(): void {
    const files = this.provider.visibleRows().filter((n) => n.kind === 'file');
    if (files.length === 1) {
      void this.selectAndLoad(files[0]);
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
