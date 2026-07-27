#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = packageJson.version;

const targets = [
  {
    path: 'bin/delta-flow',
    pattern: /(DELTA_FLOW_TOWER_INTEGRATION_VERSION=)[^\s]+/,
    replacement: (_match, prefix) => `${prefix}${version}`,
  },
  {
    path: 'bin/delta-flow.ps1',
    pattern: /(DELTA_FLOW_TOWER_INTEGRATION_VERSION=)[^\s]+/,
    replacement: (_match, prefix) => `${prefix}${version}`,
  },
  {
    path: 'src/towerSetup.ts',
    pattern: /(export const TOWER_INTEGRATION_VERSION = ')[^']+(';)/,
    replacement: (_match, prefix, suffix) => `${prefix}${version}${suffix}`,
  },
];

for (const target of targets) {
  const filename = path.join(root, target.path);
  const before = fs.readFileSync(filename, 'utf8');
  if (!target.pattern.test(before)) {
    throw new Error(`Could not find the integration version marker in ${target.path}`);
  }
  const after = before.replace(target.pattern, target.replacement);
  if (after !== before) {
    fs.writeFileSync(filename, after);
  }
}

console.log(`Tower integration version synchronized to ${version}`);
