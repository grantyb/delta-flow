import * as vscode from 'vscode';
import { ChangeEntry, ChangeSet } from './changeModel';
import { describeEntry, statusIcon } from './decorate';
import { buildTree, TreeNode } from './fileTree';

/** Mirrors the Explorer's own compaction toggle. */
function compactFoldersEnabled(): boolean {
  return vscode.workspace.getConfiguration('explorer').get<boolean>('compactFolders', true);
}

/** Numbers every node (for unique TreeItem ids) and records child→parent links. */
function indexTree(root: TreeNode): Map<TreeNode, TreeNode> {
  const parents = new Map<TreeNode, TreeNode>();
  let next = 0;
  const walk = (node: TreeNode, parent?: TreeNode): void => {
    node.uid = next++;
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
  private collapsed = false;
  private generation = 0;
  private root = new TreeNode('', 'folder');
  private parents = new Map<TreeNode, TreeNode>();
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;

  /** Populated once git finishes; fires a refresh so the tree re-renders. */
  setChanges(changes: ChangeSet): void {
    this.entries = changes.entries;
    this.rebuild();
  }

  /** Rebuilds with fresh node identities so VS Code honors the new expansion state. */
  setCollapsed(collapsed: boolean): void {
    this.collapsed = collapsed;
    this.rebuild();
  }

  getChildren(node?: TreeNode): TreeNode[] {
    return this.sorted([...(node ?? this.root).children.values()]);
  }

  getParent(node: TreeNode): TreeNode | undefined {
    return this.parents.get(node);
  }

  /** The first file in display order, used to seed the initial selection. */
  firstFile(): TreeNode | undefined {
    return this.findFirstFile(this.getChildren());
  }

  private findFirstFile(nodes: TreeNode[]): TreeNode | undefined {
    for (const node of nodes) {
      if (node.kind === 'file') {
        return node;
      }
      const found = this.findFirstFile(this.getChildren(node));
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  getTreeItem(node: TreeNode): vscode.TreeItem {
    const item = node.kind === 'folder' ? this.folderItem(node) : this.fileItem(node);
    // A generation-stamped id makes VS Code treat items as new after a toggle,
    // so it re-applies collapsibleState instead of preserving expansion state.
    item.id = `${this.generation}:${node.uid}`;
    return item;
  }

  private rebuild(): void {
    this.generation++;
    this.root = buildTree(this.entries, compactFoldersEnabled());
    this.parents = indexTree(this.root);
    this.changed.fire();
  }

  private folderItem(node: TreeNode): vscode.TreeItem {
    const state = this.collapsed
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
