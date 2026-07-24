import * as vscode from 'vscode';
import * as path from 'path';
import { ChangeEntry } from './changeModel';
import { binaryHeadline, contentUri, messageUri } from './contentProvider';
import { statusWord } from './decorate';
import { classify } from './fileKind';

/** Opens the appropriate read-only view for a changed file in the editor pane. */
export async function openDiff(entry: ChangeEntry): Promise<void> {
  switch (await classify(entry)) {
    case 'image': return openImage(entry);
    case 'binary': return openBinary(entry);
    default: return openTextDiff(entry);
  }
}

/** Keep focus in the tree so the user can keep navigating with the cursor keys. */
const SHOW_OPTIONS = { preview: true, preserveFocus: true };

async function openTextDiff(entry: ChangeEntry): Promise<void> {
  const left = contentUri('left', entry.oldPath ?? entry.path, entry.leftAbs);
  const right = contentUri('right', entry.path, entry.rightAbs);
  await vscode.commands.executeCommand('vscode.diff', left, right, diffTitle(entry), SHOW_OPTIONS);
}

/** Lets VS Code's built-in image diff render both sides; a lone side opens directly. */
async function openImage(entry: ChangeEntry): Promise<void> {
  if (entry.leftAbs && entry.rightAbs) {
    await vscode.commands.executeCommand('vscode.diff',
      vscode.Uri.file(entry.leftAbs), vscode.Uri.file(entry.rightAbs), diffTitle(entry), SHOW_OPTIONS);
    return;
  }
  const only = entry.rightAbs ?? entry.leftAbs;
  if (only) {
    await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(only), SHOW_OPTIONS);
  }
}

async function openBinary(entry: ChangeEntry): Promise<void> {
  await vscode.window.showTextDocument(messageUri(entry), SHOW_OPTIONS);
  void offerExternal(entry);
}

async function offerExternal(entry: ChangeEntry): Promise<void> {
  const open = 'Open in External App';
  const pick = await vscode.window.showInformationMessage(binaryHeadline(entry), open);
  if (pick === open) {
    await openExternalEntry(entry);
  }
}

/** Opens the file (new side, or old side if deleted) in the OS default app. */
export async function openExternalEntry(entry: ChangeEntry): Promise<void> {
  const target = entry.rightAbs ?? entry.leftAbs;
  if (target) {
    await vscode.env.openExternal(vscode.Uri.file(target));
  }
}

function diffTitle(entry: ChangeEntry): string {
  const name = path.basename(entry.path);
  if (entry.oldPath) {
    return `${name} (${entry.oldPath} → ${entry.path})`;
  }
  return `${name} (${statusWord(entry.status)})`;
}
