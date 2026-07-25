import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

const run = promisify(execFile);

interface TowerTool {
  Identifier?: string;
  [key: string]: unknown;
}

/** The CompareTools.plist entry that registers this extension with Tower. */
const TOWER_ENTRY: TowerTool = {
  ApplicationIdentifier: 'com.microsoft.VSCode',
  ApplicationName: 'Visual Studio Code',
  DisplayName: 'Delta Flow',
  Identifier: 'delta-flow',
  LaunchScript: 'delta-flow.sh',
  SupportsDiffChangeset: true,
  SupportsMergeTool: false,
};

/**
 * Installs the launcher and a CompareTools.plist entry so Tower for Mac can use
 * this extension as its diff tool. Returns the CompareTools directory.
 */
export async function installTowerIntegration(
  extensionPath: string,
  dir: string = compareToolsDir(),
): Promise<string> {
  if (process.platform !== 'darwin') {
    throw new Error('Tower integration is only available on macOS.');
  }
  await fs.mkdir(dir, { recursive: true });
  await installLaunchScript(extensionPath, dir);
  await mergePlistEntry(path.join(dir, 'CompareTools.plist'));
  return dir;
}

function compareToolsDir(): string {
  return path.join(os.homedir(), 'Library', 'Application Support',
    'com.fournova.Tower3', 'CompareTools');
}

async function installLaunchScript(extensionPath: string, dir: string): Promise<void> {
  const source = path.join(extensionPath, 'bin', 'delta-flow');
  const dest = path.join(dir, 'delta-flow.sh');
  await fs.copyFile(source, dest);
  await fs.chmod(dest, 0o755);
}

/** Adds our entry to the plist, preserving any other tools already configured. */
async function mergePlistEntry(plistPath: string): Promise<void> {
  const tools = (await readPlist(plistPath)).filter(
    (tool) => tool.Identifier !== TOWER_ENTRY.Identifier);
  tools.push(TOWER_ENTRY);
  await writePlist(plistPath, tools);
}

async function readPlist(plistPath: string): Promise<TowerTool[]> {
  try {
    const { stdout } = await run('plutil', ['-convert', 'json', '-o', '-', plistPath]);
    const parsed = JSON.parse(stdout);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return []; // No file yet, or unreadable — start fresh.
  }
}

async function writePlist(plistPath: string, tools: TowerTool[]): Promise<void> {
  const temp = path.join(os.tmpdir(), `delta-flow-plist-${process.pid}.json`);
  await fs.writeFile(temp, JSON.stringify(tools));
  try {
    await run('plutil', ['-convert', 'xml1', temp, '-o', plistPath]);
  } finally {
    await fs.rm(temp, { force: true });
  }
}
