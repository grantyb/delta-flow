#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('node:readline/promises');
const { spawnSync } = require('child_process');
const { stdin, stdout } = require('node:process');

const root = path.resolve(__dirname, '..');
const packageJsonPath = path.join(root, 'package.json');
const SEMVER = /^\d+\.\d+\.\d+$/;

function currentVersion() {
  return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).version;
}

function nextPatch(version) {
  const [major, minor, patch] = version.split('.').map(Number);
  return `${major}.${minor}.${patch + 1}`;
}

async function promptVersion(suggested) {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const answer = (await rl.question(`New version [${suggested}]: `)).trim();
    return answer || suggested;
  } finally {
    rl.close();
  }
}

// Rewrite only the version line so the rest of package.json keeps its formatting.
function writeVersion(version) {
  const before = fs.readFileSync(packageJsonPath, 'utf8');
  const after = before.replace(/("version":\s*")[^"]+(")/, `$1${version}$2`);
  if (after === before) {
    throw new Error('Could not find the "version" field in package.json');
  }
  fs.writeFileSync(packageJsonPath, after);
}

function publish() {
  // Publishing runs vscode:prepublish -> compile, which regenerates the Tower
  // integration version markers from the new package.json version.
  const result = spawnSync('npx', ['vsce', 'publish', '--allow-star-activation'],
    { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function main() {
  const current = currentVersion();
  const version = await promptVersion(nextPatch(current));
  if (!SEMVER.test(version)) {
    throw new Error(`"${version}" is not a valid MAJOR.MINOR.PATCH version`);
  }
  if (version === current) {
    throw new Error(`Version is already ${current}; choose a higher version`);
  }
  writeVersion(version);
  console.log(`package.json version set to ${version}`);
  publish();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { nextPatch };
