import * as vscode from 'vscode';
import { ChangeEntry, ChangeSet } from './changeModel';
import { openDiff } from './diffCommand';
import { DiffLoader } from './diffLoader';
import { PathFilter } from './filter';
import { TreeNode } from './fileTree';
import { matchingPaths } from './gitDiff';
import { DiffSession } from './session';
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
  private search = '';
  private searchMatches?: Set<string>;
  private current?: TreeNode;

  constructor(private readonly session: DiffSession) {
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

  get searchText(): string {
    return this.search;
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
    this.search = '';
    this.searchMatches = undefined;
    this.render();
  }

  /** Restricts the tree to files whose changed lines match the pickaxe regex. */
  async setSearch(pattern: string): Promise<void> {
    this.search = pattern.trim();
    if (!this.search) {
      this.searchMatches = undefined;
      this.render();
      return;
    }
    try {
      this.searchMatches = await matchingPaths(this.session, this.search);
    } catch {
      void vscode.window.showWarningMessage(`Invalid change search: ${this.search}`);
      return;
    }
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

  /** Left arrow: collapse an expanded folder, otherwise move to the parent. */
  collapseOrParent(): void {
    const node = this.current;
    if (!node) {
      return;
    }
    if (node.kind === 'folder' && !this.provider.isCollapsed(node)) {
      this.provider.collapse(node);
      void this.selectAndLoad(this.provider.nodeByPath(node.path) ?? node);
    } else {
      void this.selectParent(node);
    }
  }

  /** Recursively collapse a folder and all its descendants (menu passes the node). */
  collapseSubtree(node = this.current): void {
    if (node?.kind === 'folder') {
      this.provider.collapseSubtree(node);
      void this.selectAndLoad(this.provider.nodeByPath(node.path) ?? node);
    }
  }

  /** Recursively expand a folder and all its descendants. */
  expandSubtree(node = this.current): void {
    if (node?.kind === 'folder') {
      this.provider.expandSubtree(node);
      void this.selectAndLoad(this.provider.nodeByPath(node.path) ?? node);
    }
  }

  /** Right arrow: expand a collapsed folder, otherwise move to its first child. */
  expandOrChild(): void {
    const node = this.current;
    if (!node || node.kind !== 'folder') {
      return;
    }
    if (this.provider.isCollapsed(node)) {
      this.provider.expand(node);
      void this.selectAndLoad(this.provider.nodeByPath(node.path) ?? node);
    } else {
      const child = this.provider.getChildren(node)[0];
      if (child) {
        void this.selectAndLoad(child);
      }
    }
  }

  dispose(): void {
    this.loader.dispose();
    this.disposables.forEach((d) => d.dispose());
    this.view.dispose();
  }

  /** Click/Enter on a file: pin a permanent editor (not a reused preview). */
  activate(node?: TreeNode): void {
    this.current = node;
    this.loader.cancel();
    if (node?.kind === 'file' && node.entry) {
      void openDiff(node.entry, false);
    }
  }

  /** Track the cursor as selection changes (clicks, type-ahead, our reveals). */
  private onSelectionChanged(selection: readonly TreeNode[]): void {
    this.current = selection[0];
  }

  /** Moves selection to the next/previous visible row and loads it if it's a file. */
  private async step(delta: number): Promise<void> {
    const rows = this.provider.visibleRows();
    if (rows.length === 0) {
      return;
    }
    await this.selectAndLoad(rows[clamp(this.currentIndex(rows) + delta, 0, rows.length - 1)]);
  }

  /** Index of the cursor, falling back to the nearest visible ancestor. */
  private currentIndex(rows: TreeNode[]): number {
    for (let node = this.current; node; node = this.provider.getParent(node)) {
      const index = rows.indexOf(node);
      if (index >= 0) {
        return index;
      }
    }
    return -1;
  }

  private async selectParent(node: TreeNode): Promise<void> {
    const parent = this.provider.getParent(node);
    if (parent) {
      await this.selectAndLoad(parent);
    }
  }

  /** Cursor navigation: reveal and load a reused preview (throttled). */
  private async selectAndLoad(node: TreeNode): Promise<void> {
    await this.view.reveal(node, { select: true, focus: true });
    this.current = node;
    if (node.kind === 'file' && node.entry) {
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
    this.visible = new ChangeSet(this.changes.entries.filter((e) => this.keep(e)));
    this.provider.setChanges(this.visible);
    this.view.description = this.describeFilters();
    this.view.message = this.messageFor(this.visible);
  }

  private keep(entry: ChangeEntry): boolean {
    return this.filter.keep(entry) && this.matchesSearch(entry);
  }

  private matchesSearch(entry: ChangeEntry): boolean {
    if (!this.searchMatches) {
      return true;
    }
    return this.searchMatches.has(entry.path) ||
      (entry.oldPath !== undefined && this.searchMatches.has(entry.oldPath));
  }

  private describeFilters(): string | undefined {
    const parts: string[] = [];
    if (this.filter.isActive) {
      parts.push(this.filter.summary());
    }
    if (this.search) {
      parts.push(`search: ${this.search}`);
    }
    return parts.length > 0 ? parts.join('  ·  ') : undefined;
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
      return 'No files match the current filter or search.';
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
