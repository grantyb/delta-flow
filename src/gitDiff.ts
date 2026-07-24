import { execFile } from 'child_process';
import * as path from 'path';
import { ChangeEntry, ChangeSet, ChangeStatus } from './changeModel';
import { DiffSession } from './session';

/** Loosened rename/copy thresholds so moved-and-edited files still pair up. */
const SIMILARITY_ARGS = ['-M25', '-C25'];

/** Runs git's own rename detection across the two temp trees and models the result. */
export async function loadChanges(session: DiffSession): Promise<ChangeSet> {
  const raw = await runRawDiff(session.left, session.right);
  return new ChangeSet(new RawDiffParser(session).parse(raw));
}

function runRawDiff(left: string, right: string): Promise<string> {
  const args = ['diff', '--no-index', '--find-renames', '--find-copies',
    ...SIMILARITY_ARGS, '--raw', '-z', '--', left, right];
  return new Promise((resolve, reject) => {
    execFile('git', args, { maxBuffer: 256 * 1024 * 1024 }, (err, stdout) => {
      // git diff exits 1 when differences are found — that is success for us.
      if (err && (err as NodeJS.ErrnoException).code !== '1' && (err as { code?: number }).code !== 1) {
        return reject(err);
      }
      resolve(stdout);
    });
  });
}

/** Parses `git diff --raw -z` output; holds the cursor state while walking tokens. */
class RawDiffParser {
  private tokens: string[] = [];
  private cursor = 0;

  constructor(private readonly session: DiffSession) {}

  parse(raw: string): ChangeEntry[] {
    this.tokens = raw.split('\0').filter((t) => t.length > 0);
    this.cursor = 0;
    const entries: ChangeEntry[] = [];
    while (this.cursor < this.tokens.length) {
      const entry = this.parseRecord();
      if (entry) {
        entries.push(entry);
      }
    }
    return entries;
  }

  private parseRecord(): ChangeEntry | undefined {
    const meta = this.next();
    if (!meta.startsWith(':')) {
      return undefined;
    }
    const status = this.statusOf(meta);
    if (status === 'R' || status === 'C') {
      return this.renameEntry(status, this.scoreOf(meta));
    }
    return this.simpleEntry(status);
  }

  private renameEntry(status: ChangeStatus, score?: number): ChangeEntry {
    const oldPath = this.rel(this.next());
    const newPath = this.rel(this.next());
    return {
      status, score, path: newPath, oldPath,
      leftAbs: path.join(this.session.left, oldPath),
      rightAbs: path.join(this.session.right, newPath),
    };
  }

  private simpleEntry(status: ChangeStatus): ChangeEntry {
    const rel = this.rel(this.next());
    return {
      status, path: rel,
      leftAbs: status === 'A' ? undefined : path.join(this.session.left, rel),
      rightAbs: status === 'D' ? undefined : path.join(this.session.right, rel),
    };
  }

  private statusOf(meta: string): ChangeStatus {
    return this.statusToken(meta)[0] as ChangeStatus;
  }

  private scoreOf(meta: string): number | undefined {
    const digits = this.statusToken(meta).slice(1);
    return digits ? parseInt(digits, 10) : undefined;
  }

  private statusToken(meta: string): string {
    return meta.trim().split(/\s+/).pop()!;
  }

  /** Strips the LEFT or RIGHT tree prefix that git echoes back for each path. */
  private rel(token: string): string {
    for (const base of [this.session.left, this.session.right]) {
      const prefix = base.endsWith(path.sep) ? base : base + path.sep;
      if (token.startsWith(prefix)) {
        return token.slice(prefix.length);
      }
    }
    return token;
  }

  private next(): string {
    return this.tokens[this.cursor++];
  }
}
