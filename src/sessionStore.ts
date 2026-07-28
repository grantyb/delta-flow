import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

/**
 * The per-user cache directory under which the launchers create diff sessions.
 * Must stay in sync with `cache_base`/`sessions_root` in bin/delta-flow(.ps1).
 */
export function sessionCacheDirectory(): string {
  return path.join(cacheBase(), 'delta-flow');
}

function cacheBase(): string {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Caches');
  }
  if (process.platform === 'win32') {
    return process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
  }
  return process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), '.cache');
}

/** Removes the cache directory holding all diff sessions. A no-op if absent. */
export async function removeSessionCache(): Promise<void> {
  await fs.rm(sessionCacheDirectory(), { recursive: true, force: true });
}

/**
 * Deletes a session directory in a detached process that outlives this
 * extension host. A window opened in place of another must clear its own
 * snapshot, but must not delay the replacement doing so — hence fire-and-forget.
 * Best-effort: the launcher's stale-session sweep is the backstop.
 */
export function scheduleSessionRemoval(dir: string): void {
  const command = process.platform === 'win32' ? 'cmd' : 'rm';
  const args = process.platform === 'win32'
    ? ['/c', 'rmdir', '/s', '/q', dir]
    : ['-rf', '--', dir];
  try {
    spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  } catch {
    // Best-effort; the stale-session sweep will reclaim it later.
  }
}
