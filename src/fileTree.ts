import { ChangeEntry } from './changeModel';

export type NodeKind = 'folder' | 'file';

/** A node in the folder hierarchy shown in the sidebar. */
export class TreeNode {
  readonly children = new Map<string, TreeNode>();
  /** Set only on file nodes. */
  entry?: ChangeEntry;

  constructor(public name: string, readonly kind: NodeKind) {}
}

/** Builds a folder hierarchy from the flat change list, keyed on destination paths. */
export function buildTree(entries: ChangeEntry[], compact = true): TreeNode {
  const root = new TreeNode('', 'folder');
  for (const entry of entries) {
    insert(root, entry);
  }
  if (compact) {
    compactChildren(root);
  }
  return root;
}

function insert(root: TreeNode, entry: ChangeEntry): void {
  const parts = entry.path.split('/');
  let node = root;
  parts.forEach((part, index) => {
    const kind: NodeKind = index === parts.length - 1 ? 'file' : 'folder';
    node = childOf(node, part, kind);
  });
  node.entry = entry;
}

function childOf(parent: TreeNode, name: string, kind: NodeKind): TreeNode {
  if (!parent.children.has(name)) {
    parent.children.set(name, new TreeNode(name, kind));
  }
  return parent.children.get(name)!;
}

/** Collapses single-child folder chains (java → com → cactuslab ⇒ java/com/cactuslab). */
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
