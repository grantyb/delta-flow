import * as vscode from 'vscode';
import { ChangeSet } from './changeModel';
import { ChangesTreeProvider } from './treeProvider';

/** Owns the sidebar tree view and its provider, and their loading/empty states. */
export class DiffView {
  private readonly provider = new ChangesTreeProvider();
  private readonly view: vscode.TreeView<unknown>;

  constructor() {
    this.view = vscode.window.createTreeView('gitDirDiff.changes', {
      treeDataProvider: this.provider,
      showCollapseAll: true,
    });
    this.view.message = 'Loading changes…';
  }

  populate(changes: ChangeSet): void {
    this.provider.setChanges(changes);
    this.view.message = changes.isEmpty ? 'No changes found.' : undefined;
  }

  dispose(): void {
    this.view.dispose();
  }
}
