import { ChangeEntry } from './changeModel';

type Matcher = (path: string) => boolean;

/** Include/exclude path filters, each a comma-separated list of expressions. */
export class PathFilter {
  private readonly includers: Matcher[];
  private readonly excluders: Matcher[];

  constructor(readonly include = '', readonly exclude = '') {
    this.includers = parse(include);
    this.excluders = parse(exclude);
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
    const parts: string[] = [];
    if (this.include.trim()) parts.push(`incl: ${this.include.trim()}`);
    if (this.exclude.trim()) parts.push(`excl: ${this.exclude.trim()}`);
    return parts.join('  ·  ');
  }
}

function matchesAny(matchers: Matcher[], paths: string[]): boolean {
  return matchers.some((match) => paths.some(match));
}

function parse(csv: string): Matcher[] {
  return csv.split(',').map(compile).filter((m): m is Matcher => m !== undefined);
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
  return (path) => path.includes(expr);
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** Converts a glob to an anchored RegExp: ** spans directories, * and ? do not. */
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
  return new RegExp(out + '$');
}

function escape(char: string): string {
  return /[.+^${}()|[\]\\]/.test(char) ? `\\${char}` : char;
}
