import * as vscode from 'vscode';
import { ChangeSet } from './changeModel';
import { describeEntry, statusIcon } from './decorate';
import { buildTree, TreeNode } from './fileTree';

/** Feeds the folder hierarchy of changed files to the sidebar, expanded by default. */
export class ChangesTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly root: TreeNode;

  constructor(changes: ChangeSet) {
    this.root = buildTree(changes.entries);
  }

  getChildren(node?: TreeNode): TreeNode[] {
    return this.sorted([...(node ?? this.root).children.values()]);
  }

  getTreeItem(node: TreeNode): vscode.TreeItem {
    return node.kind === 'folder' ? this.folderItem(node) : this.fileItem(node);
  }

  private folderItem(node: TreeNode): vscode.TreeItem {
    const item = new vscode.TreeItem(node.name, vscode.TreeItemCollapsibleState.Expanded);
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
