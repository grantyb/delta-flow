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
