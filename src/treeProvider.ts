import * as vscode from 'vscode';
import { ChangeEntry, ChangeSet } from './changeModel';
import { describeEntry, statusIcon } from './decorate';
import { buildTree, TreeNode } from './fileTree';

/** Mirrors the Explorer's own compaction toggle. */
function compactFoldersEnabled(): boolean {
  return vscode.workspace.getConfiguration('explorer').get<boolean>('compactFolders', true);
}

/** Numbers every node so each TreeItem gets a unique id within a generation. */
function assignUids(root: TreeNode): void {
  let next = 0;
  const walk = (node: TreeNode): void => {
    node.uid = next++;
    node.children.forEach(walk);
  };
  walk(root);
}

/** Feeds the folder hierarchy of changed files to the sidebar, expanded by default. */
export class ChangesTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private entries: ChangeEntry[] = [];
  private collapsed = false;
  private generation = 0;
  private root = new TreeNode('', 'folder');
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
    assignUids(this.root);
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
    item.command = { command: 'gitDirDiff.openDiff', title: 'Open Diff', arguments: [entry] };
    return item;
  }

  /** Folders first, then files, each alphabetically. */
  private sorted(nodes: TreeNode[]): TreeNode[] {
    return nodes.sort((a, b) =>
      a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'folder' ? -1 : 1);
  }
}
