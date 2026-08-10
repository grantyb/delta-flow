import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

const run = promisify(execFile);

export const TOWER_INTEGRATION_VERSION = '1.0.1';
const VERSION_PATTERN = /DELTA_FLOW_TOWER_INTEGRATION_VERSION=([^\s]+)/;

export type TowerIntegrationStatus =
  | 'not-installed'
  | 'current'
  | 'synchronized'
  | 'unsupported';

export type TowerIntegrationRemovalStatus =
  | 'not-installed'
  | 'removed'
  | 'unsupported';

interface TowerTool {
  Identifier?: string;
  [key: string]: unknown;
}

/** The CompareTools.plist entry that registers this extension with Tower for Mac. */
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
 * Registers this extension as Tower's diff tool, using whichever mechanism the
 * current platform's Tower supports. Returns the directory that was written to.
 */
export async function installTowerIntegration(extensionPath: string, dir?: string): Promise<string> {
  if (process.platform === 'darwin') {
    return installMac(extensionPath, dir ?? macCompareToolsDir());
  }
  if (process.platform === 'win32') {
    return installWindows(extensionPath, dir ?? winCompareToolsDir());
  }
  throw new Error('Tower integration is only available on macOS and Windows.');
}

/**
 * Synchronizes an existing integration with this extension version. An absent
 * integration is left alone; both upgrades and extension rollbacks are handled.
 */
export async function synchronizeTowerIntegrationIfNeeded(
  extensionPath: string,
  dir?: string,
): Promise<TowerIntegrationStatus> {
  if (process.platform === 'darwin') {
    return synchronizeMac(extensionPath, dir ?? macCompareToolsDir());
  }
  if (process.platform === 'win32') {
    return synchronizeWindows(extensionPath, dir ?? winCompareToolsDir());
  }
  return 'unsupported';
}

/** Removes only Delta Flow's Tower registration and launcher files. */
export async function uninstallTowerIntegration(
  dir?: string,
): Promise<TowerIntegrationRemovalStatus> {
  if (process.platform === 'darwin') {
    return uninstallMac(dir ?? macCompareToolsDir());
  }
  if (process.platform === 'win32') {
    return uninstallWindows(dir ?? winCompareToolsDir());
  }
  return 'unsupported';
}

// --- macOS: a launch script plus a CompareTools.plist entry ---

async function installMac(extensionPath: string, dir: string): Promise<string> {
  await fs.mkdir(dir, { recursive: true });
  await installLaunchScript(extensionPath, dir);
  await mergePlistEntry(path.join(dir, 'CompareTools.plist'));
  return dir;
}

async function synchronizeMac(extensionPath: string, dir: string): Promise<TowerIntegrationStatus> {
  const plistPath = path.join(dir, 'CompareTools.plist');
  const launcher = path.join(dir, 'delta-flow.sh');
  const registered = (await readPlist(plistPath)).some(
    (tool) => tool.Identifier === TOWER_ENTRY.Identifier);
  if (!registered && !(await exists(launcher))) {
    return 'not-installed';
  }
  const installedVersion = await installedIntegrationVersion(launcher);
  if (installedVersion === TOWER_INTEGRATION_VERSION) {
    return 'current';
  }
  await installMac(extensionPath, dir);
  return 'synchronized';
}

async function uninstallMac(dir: string): Promise<TowerIntegrationRemovalStatus> {
  const plistPath = path.join(dir, 'CompareTools.plist');
  const launcher = path.join(dir, 'delta-flow.sh');
  let removed = false;

  if (await exists(plistPath)) {
    const tools = await readPlist(plistPath);
    const remaining = tools.filter((tool) => tool.Identifier !== TOWER_ENTRY.Identifier);
    if (remaining.length !== tools.length) {
      await writePlist(plistPath, remaining);
      removed = true;
    }
  }
  if (await exists(launcher)) {
    await fs.rm(launcher, { force: true });
    removed = true;
  }
  return removed ? 'removed' : 'not-installed';
}

function macCompareToolsDir(): string {
  return path.join(os.homedir(), 'Library', 'Application Support',
    'com.fournova.Tower3', 'CompareTools');
}

async function installLaunchScript(extensionPath: string, dir: string): Promise<void> {
  const source = path.join(extensionPath, 'bin', 'delta-flow');
  const dest = path.join(dir, 'delta-flow.sh');
  try {
    if ((await fs.lstat(dest)).isSymbolicLink()) {
      // Do not let copyFile follow a manually installed link and overwrite its
      // source. Replace the integration link with the versioned launcher copy.
      await fs.unlink(dest);
    }
  } catch {
    // No existing launcher.
  }
  await fs.copyFile(source, dest);
  await fs.chmod(dest, 0o755);
}

// --- Windows: a per-tool CompareTool JSON that runs the PowerShell launcher ---

async function installWindows(extensionPath: string, dir: string): Promise<string> {
  await fs.mkdir(dir, { recursive: true });
  const launcher = path.join(dir, 'delta-flow.ps1');
  await fs.copyFile(path.join(extensionPath, 'bin', 'delta-flow.ps1'), launcher);
  const config = {
    DisplayName: 'Delta Flow',
    SupportsDiffChangeset: true,
    SupportsDirectoryDiff: true,
    DiffToolArguments: `-NoProfile -ExecutionPolicy Bypass -File "${launcher}" "$LOCAL" "$REMOTE"`,
    ApplicationPaths: [
      '%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      'powershell.exe',
    ],
  };
  await fs.writeFile(path.join(dir, 'delta-flow.json'), JSON.stringify(config, null, 2));
  return dir;
}

async function synchronizeWindows(extensionPath: string, dir: string): Promise<TowerIntegrationStatus> {
  const launcher = path.join(dir, 'delta-flow.ps1');
  const config = path.join(dir, 'delta-flow.json');
  if (!(await exists(launcher)) && !(await exists(config))) {
    return 'not-installed';
  }
  const installedVersion = await installedIntegrationVersion(launcher);
  if (installedVersion === TOWER_INTEGRATION_VERSION) {
    return 'current';
  }
  await installWindows(extensionPath, dir);
  return 'synchronized';
}

async function uninstallWindows(dir: string): Promise<TowerIntegrationRemovalStatus> {
  const targets = [
    path.join(dir, 'delta-flow.ps1'),
    path.join(dir, 'delta-flow.json'),
  ];
  const installed = (await Promise.all(targets.map(exists))).some(Boolean);
  await Promise.all(targets.map((target) => fs.rm(target, { force: true })));
  return installed ? 'removed' : 'not-installed';
}

function winCompareToolsDir(): string {
  const base = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
  return path.join(base, 'fournova', 'Tower', 'Settings', 'CompareTools');
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

async function installedIntegrationVersion(launcher: string): Promise<string | undefined> {
  try {
    const source = await fs.readFile(launcher, 'utf8');
    return source.match(VERSION_PATTERN)?.[1];
  } catch {
    // A missing launcher is a partial installation and should be repaired.
    return undefined;
  }
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}
