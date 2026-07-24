import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { ChangeEntry, ChangeStatus } from './changeModel';

/** Documents served under this scheme are inherently read-only. */
export const SCHEME = 'git-dir-diff';

/** Serves file content from the temp trees (and binary notes) as read-only documents. */
export class DiffContentProvider implements vscode.TextDocumentContentProvider {
  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    if (uri.path.startsWith('/binary/')) {
      return binaryDocument(uri);
    }
    return readText(uri.query);
  }
}

async function readText(abs: string): Promise<string> {
  if (!abs) {
    return '';
  }
  try {
    return await fs.readFile(abs, 'utf8');
  } catch {
    return '';
  }
}

/**
 * Builds a read-only URI for one side of a diff. The path carries the relative
 * name (for language detection and titles); the absolute temp path rides in the query.
 */
export function contentUri(side: 'left' | 'right', relPath: string, abs?: string): vscode.Uri {
  return vscode.Uri.from({ scheme: SCHEME, path: `/${side}/${relPath}`, query: abs ?? '' });
}

/** A read-only note shown in place of a diff for binary files. */
export function messageUri(entry: ChangeEntry): vscode.Uri {
  return vscode.Uri.from({ scheme: SCHEME, path: `/binary/${entry.status}`, query: entry.path });
}

export function binaryHeadline(entry: ChangeEntry): string {
  return headlineFor(entry.status, entry.path);
}

function binaryDocument(uri: vscode.Uri): string {
  const status = uri.path.slice('/binary/'.length) as ChangeStatus;
  const headline = headlineFor(status, uri.query);
  return `${headline}\n\nThis file can't be shown as a text diff.\n` +
    'Right-click it in Changed Files to open it in an external app.\n';
}

function headlineFor(status: ChangeStatus, name: string): string {
  switch (status) {
    case 'A': return `Binary file added: ${name}`;
    case 'D': return `Binary file deleted: ${name}`;
    case 'R': return `Binary file renamed: ${name}`;
    case 'C': return `Binary file copied: ${name}`;
    default: return `Binary files differ: ${name}`;
  }
}
