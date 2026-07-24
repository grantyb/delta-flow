import * as vscode from 'vscode';
import * as path from 'path';
import { ChangeEntry } from './changeModel';
import { contentUri } from './contentProvider';
import { statusWord } from './decorate';

/** Opens the read-only left/right diff for a changed file in the editor pane. */
export async function openDiff(entry: ChangeEntry): Promise<void> {
  const left = contentUri('left', entry.oldPath ?? entry.path, entry.leftAbs);
  const right = contentUri('right', entry.path, entry.rightAbs);
  await vscode.commands.executeCommand('vscode.diff', left, right, diffTitle(entry), { preview: true });
}

function diffTitle(entry: ChangeEntry): string {
  const name = path.basename(entry.path);
  if (entry.oldPath) {
    return `${name} (${entry.oldPath} → ${entry.path})`;
  }
  return `${name} (${statusWord(entry.status)})`;
}
