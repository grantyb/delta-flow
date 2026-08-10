import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { constants } from 'fs';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { ChangeEntry, ChangeSet } from './changeModel';
import { DiffSession } from './session';

const run = promisify(execFile);

type Side = 'left' | 'right';

/** The outcome of validating a typed directory path, for the welcome form. */
export interface DirectoryStatus {
  ok: boolean;
  path?: string;
  message?: string;
}

/** Opens a native folder picker, starting at `current`'s directory when it exists. */
export async function pickDirectory(current: string): Promise<string | undefined> {
  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: 'Select',
    title: 'Choose a directory to compare',
    defaultUri: await pickerStart(current),
  });
  return picked?.[0]?.fsPath;
}

/**
 * Validates a typed path (absolute, `~`-relative, or relative to the open
 * folder): reports its absolute path when it is a readable directory, or a
 * reason when it exists but the user cannot read it.
 */
export async function checkDirectory(input: string): Promise<DirectoryStatus> {
  if (!input.trim()) {
    return { ok: false };
  }
  const abs = resolveAbsolute(input);
  try {
    if (!(await fs.stat(abs)).isDirectory()) {
      return { ok: false };
    }
  } catch {
    return { ok: false }; // Missing — a plain red border is enough.
  }
  try {
    await fs.access(abs, constants.R_OK | constants.X_OK);
  } catch {
    return { ok: false, message: 'This directory can’t be read (permission denied).' };
  }
  return { ok: true, path: abs };
}

/**
 * Tab-completes a partial directory path to the longest shared prefix of the
 * matching subdirectories; a single match descends into it. Returns the new
 * input value, or undefined when nothing extends what was typed.
 */
export async function completeDirectory(input: string): Promise<string | undefined> {
  const sep = input.includes('\\') && !input.includes('/') ? '\\' : '/';
  const cut = Math.max(input.lastIndexOf('/'), input.lastIndexOf('\\'));
  const dirPart = input.slice(0, cut + 1);
  const prefix = input.slice(cut + 1).toLowerCase();
  const names = await subdirectories(resolveAbsolute(dirPart || '.'));
  const matches = names.filter((name) => name.toLowerCase().startsWith(prefix));
  if (matches.length === 0) {
    return undefined;
  }
  const completedName = matches.length === 1 ? matches[0] + sep : longestCommonPrefix(matches);
  const completed = dirPart + completedName;
  return completed !== input ? completed : undefined;
}

async function subdirectories(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

function longestCommonPrefix(values: string[]): string {
  let prefix = values[0];
  for (const value of values) {
    while (!value.startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
    }
  }
  return prefix;
}

async function pickerStart(current: string): Promise<vscode.Uri | undefined> {
  const trimmed = current.trim();
  if (trimmed) {
    const abs = resolveAbsolute(trimmed);
    for (const candidate of [abs, path.dirname(abs)]) {
      try {
        if ((await fs.stat(candidate)).isDirectory()) {
          return vscode.Uri.file(candidate);
        }
      } catch {
        // Try the next fallback.
      }
    }
  }
  const root = workspaceRoot();
  return root ? vscode.Uri.file(root) : undefined;
}

function resolveAbsolute(input: string): string {
  const trimmed = input.trim();
  const expanded = trimmed.startsWith('~') ? path.join(os.homedir(), trimmed.slice(1)) : trimmed;
  return path.resolve(workspaceRoot() ?? os.homedir(), expanded);
}

function workspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

/**
 * Drops changed entries that each side's own .gitignore rules exclude, so a
 * directory comparison isn't cluttered by build output, dependencies, and the
 * like. An entry survives if any directory it lives in still tracks it, and the
 * whole pass is a no-op when neither directory ignores anything.
 */
export async function excludeIgnored(session: DiffSession, changes: ChangeSet): Promise<ChangeSet> {
  const leftPaths = new Set<string>();
  const rightPaths = new Set<string>();
  for (const entry of changes.entries) {
    for (const [side, relPath] of locations(entry)) {
      (side === 'left' ? leftPaths : rightPaths).add(relPath);
    }
  }
  let scratch: string | undefined;
  try {
    scratch = await scratchRepository();
    const gitDir = path.join(scratch, '.git');
    const [ignoredLeft, ignoredRight] = await Promise.all([
      ignoredPaths(gitDir, session.left, leftPaths),
      ignoredPaths(gitDir, session.right, rightPaths),
    ]);
    return new ChangeSet(changes.entries.filter((entry) =>
      !locations(entry).every(([side, relPath]) =>
        (side === 'left' ? ignoredLeft : ignoredRight).has(relPath))));
  } catch {
    return changes; // Best-effort: show the full diff rather than fail the comparison.
  } finally {
    if (scratch) {
      await fs.rm(scratch, { recursive: true, force: true });
    }
  }
}

/** Each side the entry physically occupies, with its relative path on that side. */
function locations(entry: ChangeEntry): Array<[Side, string]> {
  switch (entry.status) {
    case 'A': return [['right', entry.path]];
    case 'D': return [['left', entry.path]];
    case 'R':
    case 'C': return [['left', entry.oldPath ?? entry.path], ['right', entry.path]];
    default: return [['left', entry.path], ['right', entry.path]];
  }
}

/** The subset of `relPaths` that `workTree`'s .gitignore rules exclude. */
function ignoredPaths(gitDir: string, workTree: string, relPaths: Set<string>): Promise<Set<string>> {
  if (relPaths.size === 0) {
    return Promise.resolve(new Set());
  }
  return new Promise((resolve) => {
    const child = execFile('git',
      ['--git-dir', gitDir, '--work-tree', workTree, 'check-ignore', '-z', '--stdin'],
      { cwd: workTree, maxBuffer: 64 * 1024 * 1024 },
      // Exit 1 (nothing ignored) and any error land here with the ignored set so far.
      (_err, stdout) => resolve(new Set(stdout.split('\0').filter((entry) => entry.length > 0))));
    child.stdin?.end([...relPaths].join('\0'));
  });
}

/** A throwaway repository whose work tree we retarget, so check-ignore runs on any directory. */
async function scratchRepository(): Promise<string> {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'delta-flow-ignore-'));
  await run('git', ['init', '-q', base]);
  return base;
}
