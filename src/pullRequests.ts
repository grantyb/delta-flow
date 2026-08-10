import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { currentBranch, repoRoot } from './repo';
import { createSnapshot, difftoolArgs, ShowSnapshot } from './snapshotDiff';

const run = promisify(execFile);

export interface PullRequest {
  number: number;
  title: string;
  baseRefName: string;
  headRefName: string;
  isDraft: boolean;
  author: { login: string } | null;
}

/** Classified outcome of listing open pull requests, for callers that render their own UI. */
export type PullRequestListing =
  | { status: 'ok'; repository: string; pullRequests: PullRequest[] }
  | { status: 'empty'; repository: string }
  | { status: 'no-repo' }
  | { status: 'no-cli' }
  | { status: 'error'; message: string };

interface Repository {
  nameWithOwner: string;
}

interface PullRequestPick extends vscode.QuickPickItem {
  pullRequest: PullRequest;
}

type PullRequestGrouping = 'none' | 'author' | 'draftStatus' | 'baseBranch';

/** Lists the repository's open pull requests and opens the selected comparison. */
export async function diffPullRequest(extensionPath: string, show: ShowSnapshot): Promise<void> {
  const repo = await repoRoot();
  if (!repo) {
    void vscode.window.showErrorMessage('Delta Flow: open a folder that is a Git repository first.');
    return;
  }

  try {
    const repository = await githubRepository(repo);
    const pullRequests = await listPullRequests(repo);
    if (pullRequests.length === 0) {
      void vscode.window.showInformationMessage(
        `Delta Flow: ${repository.nameWithOwner} has no open pull requests.`);
      return;
    }

    const branch = await currentBranch(repo);
    const grouping = vscode.workspace
      .getConfiguration('deltaFlow')
      .get<PullRequestGrouping>('pullRequestGrouping', 'none');
    const selected = await vscode.window.showQuickPick(
      quickPickItems(pullRequests, grouping, branch),
      {
        title: `Open Pull Requests · ${repository.nameWithOwner}`,
        placeHolder: 'Choose a pull request to compare',
        matchOnDescription: true,
        matchOnDetail: true,
      });
    if (!selected || !('pullRequest' in selected)) {
      return;
    }

    await openPullRequest(extensionPath, selected.pullRequest, show);
  } catch (err) {
    if (isMissingGitHubCli(err)) {
      await showMissingGitHubCli();
      return;
    }
    void vscode.window.showErrorMessage(
      `Delta Flow: could not open a pull request — ${errorMessage(err)}`);
  }
}

/** Lists open pull requests, classifying failures so the welcome view can render them inline. */
export async function listOpenPullRequests(): Promise<PullRequestListing> {
  const repo = await repoRoot();
  if (!repo) {
    return { status: 'no-repo' };
  }
  try {
    const repository = await githubRepository(repo);
    const pullRequests = await listPullRequests(repo);
    return pullRequests.length === 0
      ? { status: 'empty', repository: repository.nameWithOwner }
      : { status: 'ok', repository: repository.nameWithOwner, pullRequests };
  } catch (err) {
    return isMissingGitHubCli(err) ? { status: 'no-cli' } : { status: 'error', message: errorMessage(err) };
  }
}

/** Opens the comparison for one pull request, reporting problems as toasts. */
export async function openPullRequest(
  extensionPath: string,
  pullRequest: PullRequest,
  show: ShowSnapshot,
): Promise<void> {
  const repo = await repoRoot();
  if (!repo) {
    void vscode.window.showErrorMessage('Delta Flow: open a folder that is a Git repository first.');
    return;
  }
  try {
    const repository = await githubRepository(repo);
    const remote = await githubRemote(repo, repository.nameWithOwner);
    await launchPullRequestDiff(extensionPath, repo, remote, pullRequest, show);
  } catch (err) {
    if (isMissingGitHubCli(err)) {
      await showMissingGitHubCli();
      return;
    }
    void vscode.window.showErrorMessage(
      `Delta Flow: could not open a pull request — ${errorMessage(err)}`);
  }
}

function isMissingGitHubCli(err: unknown): boolean {
  const execError = err as NodeJS.ErrnoException & { path?: string };
  return execError.code === 'ENOENT' && execError.path === 'gh';
}

async function showMissingGitHubCli(): Promise<void> {
  const install = 'View Install Instructions';
  const selected = await vscode.window.showErrorMessage(
    'Delta Flow requires GitHub CLI (gh). Install it, then run "gh auth login" before trying again.',
    install);
  if (selected === install) {
    await vscode.env.openExternal(vscode.Uri.parse('https://cli.github.com/'));
  }
}

function quickPickItems(
  pullRequests: PullRequest[],
  grouping: PullRequestGrouping,
  currentBranch: string | undefined,
): PullRequestPick[] | Array<PullRequestPick | vscode.QuickPickItem> {
  if (grouping === 'none') {
    const sorted = [...pullRequests].sort((left, right) =>
      Number(right.baseRefName === currentBranch) - Number(left.baseRefName === currentBranch));
    return sorted.map((pullRequest) => toQuickPick(pullRequest, currentBranch));
  }

  const groups = new Map<string, PullRequest[]>();
  for (const pullRequest of pullRequests) {
    const label = groupLabel(pullRequest, grouping, currentBranch);
    groups.set(label, [...(groups.get(label) ?? []), pullRequest]);
  }

  return [...groups]
    .sort(([left], [right]) =>
      left.localeCompare(right, undefined, { sensitivity: 'base', numeric: true }))
    .flatMap(([label, entries]) => [
      { label, kind: vscode.QuickPickItemKind.Separator },
      ...entries.map((pullRequest) => toQuickPick(pullRequest, currentBranch)),
    ]);
}

function groupLabel(
  pullRequest: PullRequest,
  grouping: Exclude<PullRequestGrouping, 'none'>,
  currentBranch: string | undefined,
): string {
  switch (grouping) {
    case 'author':
      return `Author: ${pullRequest.author?.login ?? 'unknown'}`;
    case 'draftStatus':
      return pullRequest.isDraft ? 'Draft' : 'Ready for review';
    case 'baseBranch': {
      const current = pullRequest.baseRefName === currentBranch ? ' · current branch' : '';
      return `Base: ${pullRequest.baseRefName}${current}`;
    }
  }
}

function toQuickPick(
  pullRequest: PullRequest,
  currentBranch: string | undefined,
): PullRequestPick {
  const current = pullRequest.baseRefName === currentBranch;
  const draft = pullRequest.isDraft ? '$(edit) Draft · ' : '';
  const author = pullRequest.author?.login ?? 'unknown author';
  return {
    label: `${current ? '$(star-full)' : '$(git-pull-request)'} #${pullRequest.number} ${pullRequest.title}`,
    description: `${current ? 'Targets current branch · ' : ''}${draft}${author}`,
    detail: `${pullRequest.baseRefName} ← ${pullRequest.headRefName}`,
    pullRequest,
  };
}

async function githubRepository(repo: string): Promise<Repository> {
  const { stdout } = await run('gh', ['repo', 'view', '--json', 'nameWithOwner'], { cwd: repo });
  return JSON.parse(stdout) as Repository;
}

async function listPullRequests(repo: string): Promise<PullRequest[]> {
  const fields = 'number,title,baseRefName,headRefName,isDraft,author';
  const { stdout } = await run(
    'gh', ['pr', 'list', '--state', 'open', '--limit', '100', '--json', fields],
    { cwd: repo, maxBuffer: 16 * 1024 * 1024 });
  return JSON.parse(stdout) as PullRequest[];
}

/**
 * Finds the configured Git remote for the repository selected by gh. Matching
 * the owner/name avoids accidentally fetching a similarly named fork remote.
 */
async function githubRemote(repo: string, nameWithOwner: string): Promise<string> {
  const { stdout } = await run('git', ['-C', repo, 'remote']);
  for (const remote of stdout.split(/\r?\n/).filter(Boolean)) {
    const result = await run('git', ['-C', repo, 'remote', 'get-url', remote]);
    if (repositoryName(result.stdout.trim()) === nameWithOwner.toLowerCase()) {
      return remote;
    }
  }
  throw new Error(`no Git remote matches ${nameWithOwner}`);
}

function repositoryName(remoteUrl: string): string | undefined {
  const match = remoteUrl
    .replace(/\\/g, '/')
    .match(/(?:[:/])([^/:]+\/[^/]+?)(?:\.git)?$/);
  return match?.[1].toLowerCase();
}

/**
 * Fetches GitHub's base branch and synthetic PR head without checking either
 * out, opens the comparison in place of the current window, then drops the
 * hidden refs once the trees are snapshotted. Unique refs keep concurrent
 * comparisons isolated.
 */
async function launchPullRequestDiff(
  extensionPath: string,
  repo: string,
  remote: string,
  pullRequest: PullRequest,
  show: ShowSnapshot,
): Promise<void> {
  const nonce = `${process.pid}-${Date.now()}`;
  const refRoot = `refs/delta-flow/pr-${pullRequest.number}-${nonce}`;
  const baseRef = `${refRoot}/base`;
  const headRef = `${refRoot}/head`;
  try {
    await run('git', [
      '-C', repo, 'fetch', '--no-tags', remote,
      `+refs/heads/${pullRequest.baseRefName}:${baseRef}`,
      `+refs/pull/${pullRequest.number}/head:${headRef}`,
    ]);
    const args = difftoolArgs(extensionPath, repo, [`${baseRef}...${headRef}`]);
    const env = { ...process.env, DELTA_FLOW_WORKSPACE_NAME: pullRequestWorkspaceName(pullRequest) };
    show(await createSnapshot(args, env, () => deleteRefs(repo, baseRef, headRef)));
  } catch (err) {
    await deleteRefs(repo, baseRef, headRef);
    throw err;
  }
}

/** A descriptive, cross-platform-safe stem for VS Code's workspace title. */
function pullRequestWorkspaceName(pullRequest: PullRequest): string {
  const author = pullRequest.author?.login ?? 'unknown author';
  const status = pullRequest.isDraft ? ' [Draft]' : '';
  const prefix = `PR #${pullRequest.number}${status} - `;
  const suffix = ` - ${author}`;
  const title = pullRequest.title
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  const titleBytes = Math.max(20, 180 - Buffer.byteLength(prefix + suffix));
  return prefix + truncateUtf8(title, titleBytes) + suffix;
}

function truncateUtf8(value: string, maxBytes: number): string {
  let result = '';
  for (const character of value) {
    if (Buffer.byteLength(result + character) > maxBytes) {
      break;
    }
    result += character;
  }
  return result.replace(/[ .]+$/, '');
}

async function deleteRefs(repo: string, ...refs: string[]): Promise<void> {
  await Promise.all(refs.map(async (ref) => {
    try {
      await run('git', ['-C', repo, 'update-ref', '-d', ref]);
    } catch {
      // Best-effort cleanup; stale refs are harmless and hidden from branches.
    }
  }));
}

function errorMessage(err: unknown): string {
  const execError = err as Error & { stderr?: string };
  return execError.stderr?.trim() || execError.message;
}
