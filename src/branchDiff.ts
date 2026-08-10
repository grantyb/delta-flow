import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { currentBranch, repoRoot } from './repo';
import { createSnapshot, difftoolArgs, ShowSnapshot } from './snapshotDiff';
import { diffWorkingTreeAgainst } from './workingTree';

const run = promisify(execFile);

/** workspaceState key: remembered base branch per current-branch name. */
const REMEMBERED_BASES = 'deltaFlow.baseBranches';

/** True when the working tree has uncommitted changes (tracked edits or new files). */
export async function hasWorkingTreeChanges(repo: string): Promise<boolean> {
  const { stdout } = await run('git', ['-C', repo, 'status', '--porcelain']);
  return stdout.trim().length > 0;
}

/** The repository's local branch names, for the branch-comparison pickers. */
export async function listBranches(): Promise<string[]> {
  const repo = await repoRoot();
  if (!repo) {
    return [];
  }
  try {
    const { stdout } = await run('git', ['-C', repo, 'for-each-ref', '--format=%(refname:short)', 'refs/heads']);
    return stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/** Opens a read-only comparison of two branches (left..right) in the current window. */
export async function diffBranches(
  extensionPath: string,
  left: string,
  right: string,
  show: ShowSnapshot,
): Promise<void> {
  const repo = await repoRoot();
  if (!repo || !left || !right || left === right) {
    void vscode.window.showErrorMessage('Delta Flow: choose two different branches to compare.');
    return;
  }
  try {
    const args = difftoolArgs(extensionPath, repo, [`${left}..${right}`]);
    const env = { ...process.env, DELTA_FLOW_WORKSPACE_NAME: `${left} ↔ ${right}` };
    const snapshot = await createSnapshot(args, env);
    if (snapshot) {
      show(snapshot);
    } else {
      void vscode.window.showInformationMessage(`Delta Flow: ${left} and ${right} are identical.`);
    }
  } catch (err) {
    void vscode.window.showErrorMessage(`Delta Flow: could not open the branch diff — ${(err as Error).message}`);
  }
}

/**
 * The remote-tracking base branch the current branch was (most likely) checked
 * out from — this is what the working tree is compared against. A remembered
 * choice wins; otherwise the branch whose merge-base sits closest to HEAD is the
 * best guess, mapped to its remote-tracking form and remembered for next time.
 */
export async function resolveBaseBranch(
  repo: string,
  current: string,
  memento: vscode.Memento,
): Promise<string | undefined> {
  const remembered = memento.get<Record<string, string>>(REMEMBERED_BASES, {});
  const saved = remembered[current];
  if (saved && await refExists(repo, saved)) {
    return (await remoteTrackingBranch(repo, saved)) ?? saved;
  }
  const guess = await guessBaseBranch(repo, current);
  const base = guess ? (await remoteTrackingBranch(repo, guess) ?? guess) : undefined;
  if (base) {
    await memento.update(REMEMBERED_BASES, { ...remembered, [current]: base });
  }
  return base;
}

/**
 * Compares the working tree against its base branch — the same comparison as
 * "Diff Working Tree", but with the base branch on the left instead of HEAD, so
 * it shows every difference (committed and not) between the working directory
 * and where the branch was checked out from.
 */
export async function diffBaseBranch(
  extensionPath: string,
  memento: vscode.Memento,
  show: ShowSnapshot,
): Promise<void> {
  const repo = await repoRoot();
  const current = repo ? await currentBranch(repo) : undefined;
  const base = repo && current ? await resolveBaseBranch(repo, current, memento) : undefined;
  if (!repo || !current || !base) {
    void vscode.window.showErrorMessage('Delta Flow: could not determine a base branch to compare against.');
    return;
  }
  try {
    const snapshot = await diffWorkingTreeAgainst(extensionPath, repo, base, `${base} ↔ ${current}`);
    if (snapshot) {
      show(snapshot);
    } else {
      void vscode.window.showInformationMessage(`Delta Flow: the working tree has no changes against ${base}.`);
    }
  } catch (err) {
    void vscode.window.showErrorMessage(`Delta Flow: could not open the branch diff — ${(err as Error).message}`);
  }
}

/** The candidate branch whose fork point is nearest HEAD — the likeliest parent. */
async function guessBaseBranch(repo: string, current: string): Promise<string | undefined> {
  let best: string | undefined;
  let bestDistance = Infinity;
  for (const candidate of await baseCandidates(repo, current)) {
    const base = await mergeBase(repo, candidate);
    const distance = base ? await commitCount(repo, `${base}..HEAD`) : 0;
    if (distance >= 1 && distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

/** Local branches (minus the current one) plus the repository's default branch. */
async function baseCandidates(repo: string, current: string): Promise<string[]> {
  const { stdout } = await run('git', ['-C', repo, 'for-each-ref', '--format=%(refname:short)', 'refs/heads']);
  const branches = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const preferred = await defaultBranch(repo);
  if (preferred && !branches.includes(preferred)) {
    branches.push(preferred);
  }
  return branches.filter((branch) => branch !== current);
}

async function defaultBranch(repo: string): Promise<string | undefined> {
  try {
    const { stdout } = await run('git', ['-C', repo, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * The remote-tracking counterpart of a branch: itself when it is already remote
 * tracking, else its configured upstream, else `origin/<branch>` when present.
 * Undefined when the branch has no remote version.
 */
async function remoteTrackingBranch(repo: string, branch: string): Promise<string | undefined> {
  if (await refExists(repo, `refs/remotes/${branch}`)) {
    return branch;
  }
  const upstream = await upstreamOf(repo, branch);
  if (upstream) {
    return upstream;
  }
  return (await refExists(repo, `refs/remotes/origin/${branch}`)) ? `origin/${branch}` : undefined;
}

async function upstreamOf(repo: string, branch: string): Promise<string | undefined> {
  try {
    const { stdout } = await run('git', ['-C', repo, 'rev-parse', '--abbrev-ref', `${branch}@{upstream}`]);
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

async function mergeBase(repo: string, ref: string): Promise<string | undefined> {
  try {
    const { stdout } = await run('git', ['-C', repo, 'merge-base', ref, 'HEAD']);
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

async function commitCount(repo: string, range: string): Promise<number> {
  const { stdout } = await run('git', ['-C', repo, 'rev-list', '--count', range]);
  return Number(stdout.trim()) || 0;
}

async function refExists(repo: string, ref: string): Promise<boolean> {
  try {
    await run('git', ['-C', repo, 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}
