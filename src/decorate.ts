import * as vscode from 'vscode';
import { ChangeEntry, ChangeStatus } from './changeModel';

const STATUS_WORDS: Record<ChangeStatus, string> = {
  A: 'added', M: 'modified', D: 'deleted', R: 'renamed', C: 'copied',
};

const STATUS_ICONS: Record<ChangeStatus, [string, string]> = {
  A: ['diff-added', 'gitDecoration.addedResourceForeground'],
  M: ['diff-modified', 'gitDecoration.modifiedResourceForeground'],
  D: ['diff-removed', 'gitDecoration.deletedResourceForeground'],
  R: ['diff-renamed', 'gitDecoration.renamedResourceForeground'],
  C: ['diff-renamed', 'gitDecoration.renamedResourceForeground'],
};

export function statusWord(status: ChangeStatus): string {
  return STATUS_WORDS[status] ?? status;
}

/** The trailing description shown next to a file in the tree. */
export function describeEntry(entry: ChangeEntry): string {
  if (entry.status === 'R' || entry.status === 'C') {
    return describeRename(entry);
  }
  return statusWord(entry.status);
}

function describeRename(entry: ChangeEntry): string {
  const verb = entry.score === 100 ? 'moved · no content change' : `${statusWord(entry.status)} ${entry.score}%`;
  return `${verb} · ${entry.oldPath}`;
}

export function statusIcon(status: ChangeStatus): vscode.ThemeIcon {
  const [icon, color] = STATUS_ICONS[status] ?? ['file', 'foreground'];
  return new vscode.ThemeIcon(icon, new vscode.ThemeColor(color));
}
