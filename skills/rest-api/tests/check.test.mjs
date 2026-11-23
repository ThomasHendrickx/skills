import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import YAML from 'yaml';
import { good, root } from './helpers.mjs';

const check = path.join(root, 'scripts', 'check.mjs');

// A repo with a committed compliant spec on main, the ruleset wired in, and a pre-commit hook.
function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rest-api-check-'));
  const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  fs.writeFileSync(path.join(dir, '.spectral.yaml'), `extends: [${path.join(root, 'ruleset', 'rest-api.yaml')}]\n`);
  fs.writeFileSync(path.join(dir, 'openapi.yaml'), YAML.stringify(good()));
  fs.mkdirSync(path.join(dir, '.githooks'));
  fs.writeFileSync(path.join(dir, '.githooks', 'pre-commit'), `#!/bin/sh\nexec node ${check} --base main --staged\n`, { mode: 0o755 });
  git('config', 'core.hooksPath', '.githooks');
  git('add', '.');
  git('commit', '-qm', 'base');
  return { dir, git };
}

const camelCase = (dir, file = 'openapi.yaml') => {
  const d = good();
  d.components.schemas.SalesOrder.properties.customerName = { type: 'string', maxLength: 9 };
  d.info.version = '1.5.0';
  fs.writeFileSync(path.join(dir, file), YAML.stringify(d));
};

const run = (dir, ...args) => spawnSync('node', [check, '--base', 'main', ...args], { cwd: dir, encoding: 'utf8' });

test('on command: checks every spec given and fails if one fails', () => {
  const { dir } = repo();
  fs.writeFileSync(path.join(dir, 'second.yaml'), YAML.stringify(good()));
  assert.equal(run(dir, 'openapi.yaml', 'second.yaml').status, 0);
  camelCase(dir, 'second.yaml');
  const r = run(dir, 'openapi.yaml', 'second.yaml');
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /openapi\.yaml: lint passed/);
  assert.match(r.stdout, /second\.yaml: lint FAILED/);
  assert.match(r.stdout, /zalando-118/);
});

test('on command: the diff runs against the base branch', () => {
  const { dir } = repo();
  const d = good();
  delete d.components.schemas.SalesOrder.properties.tags;
  fs.writeFileSync(path.join(dir, 'openapi.yaml'), YAML.stringify(d));
  const r = run(dir, 'openapi.yaml');
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /diff FAILED/);
  assert.match(r.stdout, /#106/);
});

test('pre-commit: a commit with a failing spec is refused, whoever commits', () => {
  const { dir, git } = repo();
  camelCase(dir);
  git('add', 'openapi.yaml');
  const r = spawnSync('git', ['commit', '-qm', 'change'], { cwd: dir, encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /zalando-118/);
});

test('pre-commit: specs are found by content, other staged files pass through', () => {
  const { dir, git } = repo();
  fs.writeFileSync(path.join(dir, 'notes.yaml'), 'title: not a spec\n');
  fs.writeFileSync(path.join(dir, 'README.md'), '# readme\n');
  git('add', '.');
  git('commit', '-qm', 'docs');
  camelCase(dir, 'orders-api.yml');
  git('add', 'orders-api.yml');
  const r = spawnSync('git', ['commit', '-qm', 'new spec'], { cwd: dir, encoding: 'utf8' });
  assert.notEqual(r.status, 0, 'a spec under another name is checked too');
});
