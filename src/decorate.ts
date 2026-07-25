import * as vscode from 'vscode';
import { ChangeEntry, ChangeStatus } from './changeModel';
import { MoveRole } from './fileTree';

const STATUS_WORDS: Record<ChangeStatus, string> = {
  A: 'added', M: 'changed', D: 'deleted', R: 'renamed', C: 'copied',
};

const STATUS_ICONS: Record<ChangeStatus, [string, string]> = {
  A: ['arrow-small-right', 'gitDecoration.addedResourceForeground'],
  M: ['circle-small-filled', 'gitDecoration.modifiedResourceForeground'],
  D: ['arrow-small-left', 'gitDecoration.deletedResourceForeground'],
  R: ['arrow-small-right', 'gitDecoration.renamedResourceForeground'],
  C: ['arrow-small-right', 'gitDecoration.renamedResourceForeground'],
};
const RENAME_ICONS: Record<MoveRole, [string, string]> = {
  from: ['arrow-small-left', 'gitDecoration.renamedResourceForeground'],
  to: ['arrow-small-right', 'gitDecoration.renamedResourceForeground'],
};

export function statusWord(status: ChangeStatus): string {
  return STATUS_WORDS[status] ?? status;
}

/** The trailing description shown next to a file in the tree. */
export function describeEntry(entry: ChangeEntry, role?: MoveRole): string {
  const base = describeChange(entry, role);
  // A 100%-similar entry already reads "no content change"; don't double up.
  if (entry.whitespaceOnly && entry.score !== 100) {
    return `${base} · whitespace only`;
  }
  return base;
}

function describeChange(entry: ChangeEntry, role?: MoveRole): string {
  if (role === 'from') {
    return `moved to ${entry.path} ${contentNote(entry)}`;
  }
  if (role === 'to') {
    return `moved from ${entry.oldPath} ${contentNote(entry)}`;
  }
  if (entry.status === 'R' || entry.status === 'C') {
    return describeRename(entry);
  }
  return statusWord(entry.status);
}

function describeRename(entry: ChangeEntry): string {
  return `${statusWord(entry.status)} ${contentNote(entry)} · ${entry.oldPath}`;
}

function contentNote(entry: ChangeEntry): string {
  return entry.score === 100 ? '· no content change' : `· ${entry.score}%`;
}

export function statusIcon(entry: ChangeEntry, role?: MoveRole): vscode.ThemeIcon | vscode.Uri {
  const [icon, color] = iconFor(entry, role);
  return new vscode.ThemeIcon(icon, new vscode.ThemeColor(color));
}

function iconFor(entry: ChangeEntry, role?: MoveRole): [string, string] {
  // The "from" end of a move reads as the file leaving that folder.
  if (entry.status === 'R' || entry.status === 'C') {
    return RENAME_ICONS[role || 'to'];
  }
  // A whitespace-only modification gets a hollow dot to set it apart.
  if (entry.status === 'M' && entry.whitespaceOnly) {
    return ['circle-small', STATUS_ICONS.M[1]];
  }
  return STATUS_ICONS[entry.status] ?? ['file', 'foreground'];
}
