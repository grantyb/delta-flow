import * as vscode from 'vscode';
import * as fs from 'fs/promises';

/** Documents served under this scheme are inherently read-only. */
export const SCHEME = 'git-dir-diff';

/** Serves file content from the temp trees so diffs stay strictly read-only. */
export class DiffContentProvider implements vscode.TextDocumentContentProvider {
  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const abs = uri.query;
    if (!abs) {
      return '';
    }
    try {
      return await fs.readFile(abs, 'utf8');
    } catch {
      return '';
    }
  }
}

/**
 * Builds a read-only URI for one side of a diff. The path carries the relative
 * name (for language detection and titles); the absolute temp path rides in the query.
 */
export function contentUri(side: 'left' | 'right', relPath: string, abs?: string): vscode.Uri {
  return vscode.Uri.from({ scheme: SCHEME, path: `/${side}/${relPath}`, query: abs ?? '' });
}
