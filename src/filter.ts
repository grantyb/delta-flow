import { ChangeEntry } from './changeModel';

type Matcher = (path: string) => boolean;

/**
 * A comma-separated path filter. Each expression includes matching files, unless
 * it starts with "!", which excludes them. Matching is case-insensitive.
 */
export class PathFilter {
  private readonly includers: Matcher[];
  private readonly excluders: Matcher[];

  constructor(readonly patterns = '') {
    const compiled = compileAll(patterns);
    this.includers = compiled.includers;
    this.excluders = compiled.excluders;
  }

  get isActive(): boolean {
    return this.includers.length > 0 || this.excluders.length > 0;
  }

  /** Keeps a file when it matches any include (or none are set) and no exclude. */
  keep(entry: ChangeEntry): boolean {
    const paths = entry.oldPath ? [entry.path, entry.oldPath] : [entry.path];
    const included = this.includers.length === 0 || matchesAny(this.includers, paths);
    return included && !matchesAny(this.excluders, paths);
  }

  summary(): string {
    return this.patterns.trim();
  }
}

function matchesAny(matchers: Matcher[], paths: string[]): boolean {
  return matchers.some((match) => paths.some(match));
}

function compileAll(csv: string): { includers: Matcher[]; excluders: Matcher[] } {
  const includers: Matcher[] = [];
  const excluders: Matcher[] = [];
  for (const raw of csv.split(',')) {
    const trimmed = raw.trim();
    const isExclude = trimmed.startsWith('!');
    const matcher = compile(isExclude ? trimmed.slice(1) : trimmed);
    if (matcher) {
      (isExclude ? excluders : includers).push(matcher);
    }
  }
  return { includers, excluders };
}

/**
 * A slash makes an expression a full-path glob; a bare glob matches the basename;
 * a plain word matches anywhere in the path (so "AbstractFoo" hits "MyAbstractFooX").
 */
function compile(raw: string): Matcher | undefined {
  const expr = raw.trim().replace(/^\//, '');
  if (!expr) {
    return undefined;
  }
  if (expr.includes('/')) {
    const re = globToRegExp(expr);
    return (path) => re.test(path);
  }
  if (expr.includes('*') || expr.includes('?')) {
    const re = globToRegExp(expr);
    return (path) => re.test(basename(path));
  }
  const needle = expr.toLowerCase();
  return (path) => path.toLowerCase().includes(needle);
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** Converts a glob to an anchored, case-insensitive RegExp: ** spans directories, * and ? do not. */
function globToRegExp(glob: string): RegExp {
  let out = '^';
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];
    if (char === '?') {
      out += '[^/]';
    } else if (char !== '*') {
      out += escape(char);
    } else if (glob[i + 1] !== '*') {
      out += '[^/]*';
    } else if (glob[i + 2] === '/') {
      out += '(?:.*/)?'; // **/ matches any number of leading directories, or none.
      i += 2;
    } else {
      out += '.*';
      i += 1;
    }
  }
  return new RegExp(out + '$', 'i');
}

function escape(char: string): string {
  return /[.+^${}()|[\]\\]/.test(char) ? `\\${char}` : char;
}
