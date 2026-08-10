#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('node:readline/promises');
const { spawn, spawnSync } = require('child_process');
const { stdin, stdout } = require('node:process');

const root = path.resolve(__dirname, '..');
const packageJsonPath = path.join(root, 'package.json');
const changelogPath = path.join(root, 'CHANGELOG.md');
const SEMVER = /^\d+\.\d+\.\d+$/;

// The placeholder heading under which unreleased changes are documented until a
// version number is chosen. See "Changelog" in AGENTS.md.
const NEXT_RELEASE_HEADING = '## NEXT_RELEASE_VERSION_NUMBER';

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

// Stamp the pending-changes heading with the chosen version, so the features
// documented under it are attributed to this release. A no-op (with a warning)
// when there is nothing pending under the placeholder.
function stampChangelog(version) {
  const before = fs.readFileSync(changelogPath, 'utf8');
  if (!before.includes(NEXT_RELEASE_HEADING)) {
    console.warn(`No "${NEXT_RELEASE_HEADING}" heading in CHANGELOG.md; leaving it unchanged.`);
    return;
  }
  fs.writeFileSync(changelogPath, before.replace(NEXT_RELEASE_HEADING, `## ${version}`));
  console.log(`CHANGELOG.md heading set to ${version}`);
}

function publish() {
  // Publishing runs vscode:prepublish -> compile, which regenerates the Tower
  // integration version markers from the new package.json version.
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['vsce', 'publish', '--allow-star-activation'],
      { cwd: root, stdio: 'inherit' });
    let interrupted = false;
    const interrupt = () => {
      interrupted = true;
      child.kill('SIGINT');
    };
    process.once('SIGINT', interrupt);
    child.once('error', (error) => {
      process.removeListener('SIGINT', interrupt);
      reject(error);
    });
    child.once('exit', (code, signal) => {
      process.removeListener('SIGINT', interrupt);
      if (interrupted || signal || code !== 0) {
        reject(new Error('Marketplace publish did not complete successfully'));
      } else {
        resolve();
      }
    });
  });
}

function releaseTagName(version, date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `release/${year}/${month}/v${version}`;
}

function tagRelease(version) {
  const tag = releaseTagName(version);
  const result = spawnSync('git', ['tag', tag], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`Published ${version}, but could not create Git tag ${tag}`);
  }
  console.log(`Git tag created: ${tag}`);
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
  stampChangelog(version);
  await publish();
  tagRelease(version);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { nextPatch, releaseTagName };
