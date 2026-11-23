import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export function installedPackages(names) {
  const execPath = process.env.npm_execpath;
  assert(execPath, 'Run through pnpm run test:security');
  const listArgs = ['list', ...names, '--depth', 'Infinity', '--json'];
  const spawnOptions = {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 60000,
    maxBuffer: 32 * 1024 * 1024,
  };
  const result = /\.(?:c|m)?js$/i.test(execPath)
    ? spawnSync(process.execPath, [execPath, ...listArgs], spawnOptions)
    : process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(execPath)
      ? spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/c', execPath, ...listArgs], spawnOptions)
      : spawnSync(execPath, listArgs, spawnOptions);
  assert.equal(result.status, 0, `Installed dependency inventory failed: ${result.stderr}`);
  const found = new Map();
  function collect(node) {
    for (const group of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      for (const [name, child] of Object.entries(node[group] ?? {})) {
        if (names.includes(name)) {
          assert(child.path, `Missing installed path for ${name}`);
          const dir = fs.realpathSync(child.path);
          const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
          found.set(dir, { name, version: pkg.version, dir, pkg });
        }
        collect(child);
      }
    }
  }
  const roots = JSON.parse(result.stdout);
  assert(Array.isArray(roots) && roots.length > 0, 'Expected an installed pnpm dependency tree');
  for (const root of roots) collect(root);
  for (const name of names) assert([...found.values()].some(pkg => pkg.name === name), `No active ${name} consumer found`);
  return [...found.values()];
}
