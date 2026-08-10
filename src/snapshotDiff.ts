import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { DiffSession } from './session';

const run = promisify(execFile);

/** The line the launcher prints in snapshot mode, carrying the session folder. */
const SESSION_DIR_PREFIX = 'DELTA_FLOW_SESSION_DIR=';

/** A persisted copy of the two compared trees, plus the folder that holds them. */
export interface Snapshot {
  session: DiffSession;
  dir: string;
}

/** Hands a freshly captured comparison to whatever renders it in the current window. */
export type ShowSnapshot = (snapshot: Snapshot) => void;

/** Builds the `git difftool` invocation that renders a comparison through our launcher. */
export function difftoolArgs(
  extensionPath: string,
  repo: string,
  revisions: string[],
  extra: string[] = [],
): string[] {
  const launcher = path.join(extensionPath, 'bin', 'delta-flow');
  const cmd = `"${launcher}" "$LOCAL" "$REMOTE"`;
  return ['-C', repo,
    '-c', `difftool.deltaFlowInline.cmd=${cmd}`,
    '-c', 'difftool.prompt=false',
    // --trust-exit-code makes a launcher failure surface as an error; without it
    // difftool swallows the code, and a missing session folder below could not be
    // told apart from an empty diff.
    'difftool', '--dir-diff', '--no-symlinks', '--no-prompt', '--trust-exit-code',
    ...extra, '-t', 'deltaFlowInline', ...revisions];
}

/**
 * Runs difftool with the launcher in snapshot mode: it copies the compared
 * trees into a session folder that outlives git's temporaries and prints the
 * folder. `afterSnapshot` runs once the trees are captured, letting callers
 * release temporary refs or index files. Returns undefined when the two sides
 * are identical — difftool then invokes nothing, so there is no session.
 */
export async function createSnapshot(
  args: string[],
  env: NodeJS.ProcessEnv,
  afterSnapshot?: () => Promise<void>,
): Promise<Snapshot | undefined> {
  const { stdout } = await run('git', args, { env: { ...env, DELTA_FLOW_SNAPSHOT_ONLY: '1' } });
  if (afterSnapshot) {
    await afterSnapshot();
  }
  const dir = sessionDir(stdout);
  return dir ? { dir, session: { left: path.join(dir, 'left'), right: path.join(dir, 'right') } } : undefined;
}

function sessionDir(output: string): string | undefined {
  for (const line of output.split(/\r?\n/)) {
    if (line.startsWith(SESSION_DIR_PREFIX)) {
      return line.slice(SESSION_DIR_PREFIX.length).trim();
    }
  }
  return undefined;
}
