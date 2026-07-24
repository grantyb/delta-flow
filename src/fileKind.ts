import * as path from 'path';
import * as fs from 'fs/promises';
import { ChangeEntry } from './changeModel';

export type FileKind = 'text' | 'image' | 'binary';

const IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.ico', '.svg', '.avif', '.tiff',
]);

/** How many leading bytes to sample when sniffing for binary content. */
const SNIFF_BYTES = 8000;

export async function classify(entry: ChangeEntry): Promise<FileKind> {
  if (isImagePath(entry.path)) {
    return 'image';
  }
  const sample = entry.rightAbs ?? entry.leftAbs;
  if (sample && (await isBinary(sample))) {
    return 'binary';
  }
  return 'text';
}

function isImagePath(target: string): boolean {
  return IMAGE_EXTENSIONS.has(path.extname(target).toLowerCase());
}

/** Treats a file as binary if its opening bytes contain a NUL, matching git's heuristic. */
async function isBinary(absPath: string): Promise<boolean> {
  try {
    const handle = await fs.open(absPath, 'r');
    try {
      const buffer = Buffer.alloc(SNIFF_BYTES);
      const { bytesRead } = await handle.read(buffer, 0, SNIFF_BYTES, 0);
      return buffer.subarray(0, bytesRead).includes(0);
    } finally {
      await handle.close();
    }
  } catch {
    return false;
  }
}
