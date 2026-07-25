export type ChangeStatus = 'A' | 'M' | 'D' | 'R' | 'C';

/** A single changed file, as detected between the LEFT and RIGHT trees. */
export interface ChangeEntry {
  status: ChangeStatus;
  /** Destination-relative path — the file's current identity in RIGHT. */
  path: string;
  /** Source-relative path in LEFT, for renames (R) and copies (C). */
  oldPath?: string;
  /** Similarity score (0-100) for renames/copies; 100 means content is identical. */
  score?: number;
  /** Absolute path within the LEFT tree; undefined for added files. */
  leftAbs?: string;
  /** Absolute path within the RIGHT tree; undefined for deleted files. */
  rightAbs?: string;
  /** Lazily filled when the file is first opened: true if the sides differ only in whitespace. */
  whitespaceOnly?: boolean;
}

/** The full set of changes for one diff session. */
export class ChangeSet {
  constructor(readonly entries: ChangeEntry[]) {}

  get isEmpty(): boolean {
    return this.entries.length === 0;
  }
}
