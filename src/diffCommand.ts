import * as vscode from 'vscode';
import * as path from 'path';
import { ChangeEntry } from './changeModel';
import { binaryHeadline, contentUri, messageUri } from './contentProvider';
import { statusWord } from './decorate';
import { classify } from './fileKind';

/**
 * Opens the appropriate read-only view for a changed file. `preview: true`
 * (cursor navigation) reuses one preview tab; `false` (click/Enter) pins a tab.
 */
export async function openDiff(entry: ChangeEntry, preview = true): Promise<void> {
  switch (await classify(entry)) {
    case 'image': return openImage(entry, preview);
    case 'binary': return openBinary(entry, preview);
    default: return openTextDiff(entry, preview);
  }
}

/** Keep focus in the tree so the user can keep navigating with the cursor keys. */
function showOptions(preview: boolean): vscode.TextDocumentShowOptions {
  return { preview, preserveFocus: true };
}

async function openTextDiff(entry: ChangeEntry, preview: boolean): Promise<void> {
  const left = contentUri('left', entry.oldPath ?? entry.path, entry.leftAbs);
  const right = contentUri('right', entry.path, entry.rightAbs);
  await vscode.commands.executeCommand('vscode.diff', left, right, diffTitle(entry), showOptions(preview));
}

/** Lets VS Code's built-in image diff render both sides; a lone side opens directly. */
async function openImage(entry: ChangeEntry, preview: boolean): Promise<void> {
  if (entry.leftAbs && entry.rightAbs) {
    await vscode.commands.executeCommand('vscode.diff',
      vscode.Uri.file(entry.leftAbs), vscode.Uri.file(entry.rightAbs), diffTitle(entry), showOptions(preview));
    return;
  }
  const only = entry.rightAbs ?? entry.leftAbs;
  if (only) {
    await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(only), showOptions(preview));
  }
}

async function openBinary(entry: ChangeEntry, preview: boolean): Promise<void> {
  await vscode.window.showTextDocument(messageUri(entry), showOptions(preview));
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
