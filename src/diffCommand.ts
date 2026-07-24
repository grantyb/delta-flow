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

async function openTextDiff(entry: ChangeEntry): Promise<void> {
  const left = contentUri('left', entry.oldPath ?? entry.path, entry.leftAbs);
  const right = contentUri('right', entry.path, entry.rightAbs);
  await vscode.commands.executeCommand('vscode.diff', left, right, diffTitle(entry), { preview: true });
}

/** Lets VS Code's built-in image diff render both sides; a lone side opens directly. */
async function openImage(entry: ChangeEntry): Promise<void> {
  if (entry.leftAbs && entry.rightAbs) {
    await vscode.commands.executeCommand('vscode.diff',
      vscode.Uri.file(entry.leftAbs), vscode.Uri.file(entry.rightAbs), diffTitle(entry), { preview: true });
    return;
  }
  const only = entry.rightAbs ?? entry.leftAbs;
  if (only) {
    await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(only), { preview: true });
  }
}

async function openBinary(entry: ChangeEntry): Promise<void> {
  await vscode.window.showTextDocument(messageUri(entry), { preview: true });
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
