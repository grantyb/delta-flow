import * as vscode from 'vscode';
import { excludeIgnored } from './directoryCompare';
import { DiffView } from './diffView';
import { loadChanges } from './gitDiff';
import { DiffSession } from './session';
import { scheduleSessionRemoval } from './sessionStore';

/** How to present a comparison: who owns cleanup, and whether to honour .gitignore. */
export interface ShowOptions {
  ownedDir?: string;
  respectGitignore?: boolean;
}

/**
 * Shows one comparison inside the current window's Delta Flow view, leaving the
 * user's own project open in the Explorer. Showing another comparison replaces
 * the previous one and reclaims the snapshot it owned.
 */
export class DiffController {
  private view?: DiffView;
  private ownedDir?: string;

  constructor(private readonly extensionUri: vscode.Uri) {}

  /** The comparison currently on screen, for commands that act on the tree. */
  get current(): DiffView | undefined {
    return this.view;
  }

  /**
   * Render `session` in the sidebar. `options.ownedDir` is the session folder to
   * delete when this comparison is replaced or the window closes (omit it for
   * launcher-owned windows, which clean up after themselves); `respectGitignore`
   * hides files the two directories' own .gitignore rules exclude.
   */
  async show(session: DiffSession, options: ShowOptions = {}): Promise<void> {
    this.clear();
    this.ownedDir = options.ownedDir;
    await setHasSession(true);
    this.view = new DiffView(session, this.extensionUri);
    await focusChanges();
    const changes = await loadChanges(session);
    this.view.populate(options.respectGitignore ? await excludeIgnored(session, changes) : changes);
    await focusChanges(); // Re-assert in case the layout restore stole focus.
  }

  /** Drop the current comparison and reveal the welcome screen again. */
  async returnToWelcome(): Promise<void> {
    this.clear();
    await setHasSession(false);
  }

  dispose(): void {
    this.clear();
  }

  /** Tear down the current view and schedule removal of the snapshot it owned. */
  private clear(): void {
    this.view?.dispose();
    this.view = undefined;
    if (this.ownedDir) {
      scheduleSessionRemoval(this.ownedDir);
      this.ownedDir = undefined;
    }
  }
}

function setHasSession(has: boolean): Thenable<unknown> {
  return vscode.commands.executeCommand('setContext', 'deltaFlow.hasSession', has);
}

async function focusChanges(): Promise<void> {
  try {
    await vscode.commands.executeCommand('deltaFlow.changes.focus');
  } catch {
    // The view may not be ready during very early startup; a later call wins.
  }
}
