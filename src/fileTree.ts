import { ChangeEntry } from './changeModel';

export type NodeKind = 'folder' | 'file';

/** For a cross-directory move, which end of the move a file node represents. */
export type MoveRole = 'from' | 'to';

/** A node in the folder hierarchy shown in the sidebar. */
export class TreeNode {
  readonly children = new Map<string, TreeNode>();
  /** Set only on file nodes. */
  entry?: ChangeEntry;
  /** Set on the two nodes of a cross-directory move; undefined for everything else. */
  moveRole?: MoveRole;
  /** Assigned per rebuild; used to give each TreeItem a unique, generation-stamped id. */
  uid = 0;
  /** Full slash-joined path from the root; stable across rebuilds. */
  path = '';

  constructor(public name: string, readonly kind: NodeKind) {}
}

interface Placement {
  path: string;
  role?: MoveRole;
}

/** Builds a folder hierarchy from the flat change list, keyed on destination paths. */
export function buildTree(entries: ChangeEntry[], compact = true): TreeNode {
  const root = new TreeNode('', 'folder');
  for (const entry of entries) {
    for (const place of placements(entry)) {
      insert(root, entry, place);
    }
  }
  if (compact) {
    compactChildren(root);
  }
  return root;
}

/**
 * A file moved to a different directory shows in both places — a "from" node at
 * its old location and a "to" node at its new one. Everything else (including a
 * same-directory rename) is a single node at its destination path.
 */
function placements(entry: ChangeEntry): Placement[] {
  if (entry.status === 'R' && entry.oldPath && dirOf(entry.oldPath) !== dirOf(entry.path)) {
    return [{ path: entry.oldPath, role: 'from' }, { path: entry.path, role: 'to' }];
  }
  return [{ path: entry.path }];
}

function dirOf(filePath: string): string {
  const slash = filePath.lastIndexOf('/');
  return slash === -1 ? '' : filePath.slice(0, slash);
}

function insert(root: TreeNode, entry: ChangeEntry, place: Placement): void {
  const parts = place.path.split('/');
  let node = root;
  parts.forEach((part, index) => {
    const kind: NodeKind = index === parts.length - 1 ? 'file' : 'folder';
    node = childOf(node, part, kind);
  });
  node.entry = entry;
  node.moveRole = place.role;
}

function childOf(parent: TreeNode, name: string, kind: NodeKind): TreeNode {
  if (!parent.children.has(name)) {
    parent.children.set(name, new TreeNode(name, kind));
  }
  return parent.children.get(name)!;
}

/** Collapses single-child folder chains (java → com → grantyb ⇒ java/com/grantyb). */
function compactChildren(node: TreeNode): void {
  const originals = [...node.children.values()];
  node.children.clear();
  for (const child of originals) {
    const merged = child.kind === 'folder' ? mergeChain(child) : child;
    compactChildren(merged);
    node.children.set(merged.name, merged);
  }
}

/** Merges a folder with its sole subfolder repeatedly, joining names with "/". */
function mergeChain(folder: TreeNode): TreeNode {
  let current = folder;
  while (isLoneSubfolder(current)) {
    const only = current.children.values().next().value as TreeNode;
    current = joined(current, only);
  }
  return current;
}

function isLoneSubfolder(node: TreeNode): boolean {
  if (node.children.size !== 1) {
    return false;
  }
  return node.children.values().next().value!.kind === 'folder';
}

function joined(parent: TreeNode, child: TreeNode): TreeNode {
  const merged = new TreeNode(`${parent.name}/${child.name}`, 'folder');
  for (const [name, grandchild] of child.children) {
    merged.children.set(name, grandchild);
  }
  return merged;
}
