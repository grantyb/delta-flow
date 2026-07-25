import * as vscode from 'vscode';
import * as path from 'path';
import { ChangeEntry } from './changeModel';
import { binaryHeadline, contentUri, messageUri } from './contentProvider';
import { statusWord } from './decorate';
import { classify } from './fileKind';
import { isWhitespaceOnly } from './gitDiff';

export interface OpenDiffOptions {
  /** Cursor navigation reuses one preview tab; click/Enter pins a permanent one. */
  preview?: boolean;
  /** Called once the whitespace-only flag is first resolved, to refresh the tree. */
  onResolved?: () => void;
}

/** Opens the appropriate read-only view for a changed file. */
export async function openDiff(entry: ChangeEntry, options: OpenDiffOptions = {}): Promise<void> {
  const preview = options.preview ?? true;
  switch (await classify(entry)) {
    case 'image': return openImage(entry, preview);
    case 'binary': return openBinary(entry, preview);
    default: return openText(entry, preview, options);
  }
}

/**
 * Shows a text diff, first resolving (once, lazily) whether the two sides differ
 * only in whitespace so the tab title and tree can say so. Whether such changes
 * render is left to the user's `diffEditor.ignoreTrimWhitespace` setting.
 */
async function openText(entry: ChangeEntry, preview: boolean, options: OpenDiffOptions): Promise<void> {
  if (entry.whitespaceOnly === undefined) {
    entry.whitespaceOnly = await isWhitespaceOnly(entry);
    options.onResolved?.();
  }
  await openTextDiff(entry, preview);
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

/** The built-in image editor; also the one that renders a raster image diff. */
const IMAGE_EDITOR = 'imagePreview.previewEditor';

/**
 * Raster images get VS Code's native side-by-side image diff. SVG has no image
 * diff (its default editor is text, so `vscode.diff` would show markup), so we
 * render the two versions as images in adjacent columns instead.
 */
async function openImage(entry: ChangeEntry, preview: boolean): Promise<void> {
  if (isSvg(entry.path)) {
    return openImagePair(entry, preview);
  }
  if (entry.leftAbs && entry.rightAbs) {
    await vscode.commands.executeCommand('vscode.diff',
      vscode.Uri.file(entry.leftAbs), vscode.Uri.file(entry.rightAbs), diffTitle(entry), showOptions(preview));
    return;
  }
  const only = entry.rightAbs ?? entry.leftAbs;
  if (only) {
    await openImageEditor(vscode.Uri.file(only), vscode.ViewColumn.One, preview);
  }
}

function isSvg(target: string): boolean {
  return path.extname(target).toLowerCase() === '.svg';
}

/** Old on the left, new on the right — each rendered by the image editor. */
async function openImagePair(entry: ChangeEntry, preview: boolean): Promise<void> {
  if (entry.leftAbs) {
    await openImageEditor(vscode.Uri.file(entry.leftAbs), vscode.ViewColumn.One, preview);
  }
  if (entry.rightAbs) {
    const column = entry.leftAbs ? vscode.ViewColumn.Two : vscode.ViewColumn.One;
    await openImageEditor(vscode.Uri.file(entry.rightAbs), column, preview);
  }
}

function openImageEditor(uri: vscode.Uri, viewColumn: vscode.ViewColumn, preview: boolean): Thenable<unknown> {
  return vscode.commands.executeCommand('vscode.openWith', uri, IMAGE_EDITOR,
    { viewColumn, preview, preserveFocus: true });
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
  const suffix = entry.whitespaceOnly ? ' · whitespace only' : '';
  if (entry.oldPath) {
    return `${name} (${entry.oldPath} → ${entry.path})${suffix}`;
  }
  return `${name} (${statusWord(entry.status)})${suffix}`;
}
