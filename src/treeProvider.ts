import * as vscode from 'vscode';
import { ChangeEntry, ChangeSet } from './changeModel';
import { describeEntry, statusIcon } from './decorate';
import { buildTree, TreeNode } from './fileTree';

/** Mirrors the Explorer's own compaction toggle. */
function compactFoldersEnabled(): boolean {
  return vscode.workspace.getConfiguration('explorer').get<boolean>('compactFolders', true);
}

/** Numbers every node (unique ids), records child→parent links, and sets full paths. */
function indexTree(root: TreeNode): Map<TreeNode, TreeNode> {
  const parents = new Map<TreeNode, TreeNode>();
  let next = 0;
  const walk = (node: TreeNode, parent?: TreeNode): void => {
    node.uid = next++;
    node.path = parent ? `${parent.path}/${node.name}` : node.name;
    if (parent) {
      parents.set(node, parent);
    }
    node.children.forEach((child) => walk(child, node));
  };
  root.children.forEach((child) => walk(child, undefined));
  return parents;
}

/** Feeds the folder hierarchy of changed files to the sidebar, expanded by default. */
export class ChangesTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private entries: ChangeEntry[] = [];
  private generation = 0;
  private root = new TreeNode('', 'folder');
  private parents = new Map<TreeNode, TreeNode>();
  private collapsedPaths = new Set<string>();
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;

  /** Populated once git finishes; fires a refresh so the tree re-renders. */
  setChanges(changes: ChangeSet): void {
    this.entries = changes.entries;
    this.collapsedPaths.clear();
    this.rebuild();
  }

  getChildren(node?: TreeNode): TreeNode[] {
    return this.sorted([...(node ?? this.root).children.values()]);
  }

  getParent(node: TreeNode): TreeNode | undefined {
    return this.parents.get(node);
  }

  getTreeItem(node: TreeNode): vscode.TreeItem {
    const item = node.kind === 'folder' ? this.folderItem(node) : this.fileItem(node);
    // A generation-stamped id makes VS Code treat items as new after a toggle,
    // so it re-applies collapsibleState instead of preserving expansion state.
    item.id = `${this.generation}:${node.uid}`;
    return item;
  }

  /** Nodes in display order, descending into folders only when expanded. */
  visibleRows(): TreeNode[] {
    const rows: TreeNode[] = [];
    const walk = (nodes: TreeNode[]): void => {
      for (const node of nodes) {
        rows.push(node);
        if (node.kind === 'folder' && !this.collapsedPaths.has(node.path)) {
          walk(this.getChildren(node));
        }
      }
    };
    walk(this.getChildren());
    return rows;
  }

  isCollapsed(node: TreeNode): boolean {
    return this.collapsedPaths.has(node.path);
  }

  /** Re-resolves a node by its stable path after a rebuild changed identities. */
  nodeByPath(path: string): TreeNode | undefined {
    const find = (nodes: TreeNode[]): TreeNode | undefined => {
      for (const node of nodes) {
        if (node.path === path) {
          return node;
        }
        if (path.startsWith(`${node.path}/`)) {
          return find(this.getChildren(node));
        }
      }
      return undefined;
    };
    return find(this.getChildren());
  }

  // Mouse-driven expand/collapse: record state without a rebuild (VS Code already did it).
  onCollapsed(node: TreeNode): void {
    this.collapsedPaths.add(node.path);
  }

  onExpanded(node: TreeNode): void {
    this.collapsedPaths.delete(node.path);
  }

  // Keyboard-driven: rebuild so VS Code re-applies the forced collapse state.
  collapse(node: TreeNode): void {
    this.collapsedPaths.add(node.path);
    this.rebuild();
  }

  expand(node: TreeNode): void {
    this.collapsedPaths.delete(node.path);
    this.rebuild();
  }

  collapseAll(): void {
    this.collapsedPaths = new Set(this.allFolderPaths());
    this.rebuild();
  }

  expandAll(): void {
    this.collapsedPaths.clear();
    this.rebuild();
  }

  private rebuild(): void {
    this.generation++;
    this.root = buildTree(this.entries, compactFoldersEnabled());
    this.parents = indexTree(this.root);
    this.changed.fire();
  }

  private allFolderPaths(): string[] {
    const paths: string[] = [];
    const walk = (nodes: TreeNode[]): void => {
      for (const node of nodes) {
        if (node.kind === 'folder') {
          paths.push(node.path);
          walk(this.getChildren(node));
        }
      }
    };
    walk(this.getChildren());
    return paths;
  }

  private folderItem(node: TreeNode): vscode.TreeItem {
    const state = this.collapsedPaths.has(node.path)
      ? vscode.TreeItemCollapsibleState.Collapsed
      : vscode.TreeItemCollapsibleState.Expanded;
    const item = new vscode.TreeItem(node.name, state);
    item.iconPath = vscode.ThemeIcon.Folder;
    item.contextValue = 'folder';
    return item;
  }

  private fileItem(node: TreeNode): vscode.TreeItem {
    const entry = node.entry!;
    const item = new vscode.TreeItem(node.name, vscode.TreeItemCollapsibleState.None);
    item.description = describeEntry(entry);
    item.iconPath = statusIcon(entry.status);
    item.contextValue = 'file';
    // Opening is driven by selection changes (see DiffView) so focus stays in the tree.
    return item;
  }

  /** Folders first, then files, each alphabetically. */
  private sorted(nodes: TreeNode[]): TreeNode[] {
    return nodes.sort((a, b) =>
      a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'folder' ? -1 : 1);
  }
}
