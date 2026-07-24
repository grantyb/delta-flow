import { ChangeEntry } from './changeModel';

export type NodeKind = 'folder' | 'file';

/** A node in the folder hierarchy shown in the sidebar. */
export class TreeNode {
  readonly children = new Map<string, TreeNode>();
  /** Set only on file nodes. */
  entry?: ChangeEntry;

  constructor(readonly name: string, readonly kind: NodeKind) {}
}

/** Builds a folder hierarchy from the flat change list, keyed on destination paths. */
export function buildTree(entries: ChangeEntry[]): TreeNode {
  const root = new TreeNode('', 'folder');
  for (const entry of entries) {
    insert(root, entry);
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
