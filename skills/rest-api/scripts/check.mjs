#!/usr/bin/env node
// Lints and diffs OpenAPI specs: the files given, or with --staged every staged file that is an
// OpenAPI document (a top-level `openapi` key), so a git pre-commit hook can run it for any author.
//
//   node check.mjs [--base <git-ref>] <spec>...    check these specs
//   node check.mjs [--base <git-ref>] --staged     check the staged specs (pre-commit)
//
// Lint uses the repo's .spectral.yaml and fails on warnings too; the diff compares with --base
// (default origin/main). Exit 1 when any spec fails.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const here = path.dirname(fileURLToPath(import.meta.url));

export function parseArgs(argv) {
  const args = { base: 'origin/main', staged: false, files: [] };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--base') args.base = argv[(i += 1)];
    else if (argv[i] === '--staged') args.staged = true;
    else args.files.push(argv[i]);
  }
  if (!args.base || (!args.staged && args.files.length === 0)) throw new Error('usage: check.mjs [--base <git-ref>] (--staged | <spec>...)');
  return args;
}

export function isOpenApi(file) {
  if (!/\.(ya?ml|json)$/i.test(file) || !fs.existsSync(file)) return false;
  try {
    const doc = YAML.parse(fs.readFileSync(file, 'utf8'), { maxAliasCount: -1 });
    return doc !== null && typeof doc === 'object' && ('openapi' in doc || 'swagger' in doc);
  } catch {
    return false;
  }
}

const stagedFiles = () => execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], { encoding: 'utf8' }).split('\n').filter(Boolean);

function spectralBin() {
  const pkg = createRequire(import.meta.url).resolve('@stoplight/spectral-cli/package.json');
  return path.join(path.dirname(pkg), JSON.parse(fs.readFileSync(pkg, 'utf8')).bin.spectral);
}

function run(cmd, cmdArgs) {
  const r = spawnSync(process.execPath, [cmd, ...cmdArgs], { encoding: 'utf8' });
  return { ok: r.status === 0, output: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
}

export function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    console.error(e.message);
    return 2;
  }
  const files = (args.staged ? stagedFiles() : args.files).filter((f) => (args.staged ? isOpenApi(f) : true));
  let failed = false;
  for (const file of files) {
    if (!fs.existsSync(file)) {
      console.log(`${file}: not found`);
      failed = true;
      continue;
    }
    const lint = run(spectralBin(), ['lint', file, '--fail-severity=warn']);
    const diff = run(path.join(here, 'diff.mjs'), ['--base', args.base, file]);
    console.log(`== ${file}: lint ${lint.ok ? 'passed' : 'FAILED'}, diff ${diff.ok ? 'passed' : 'FAILED'}`);
    if (!lint.ok) console.log(lint.output);
    if (!diff.ok) console.log(diff.output);
    failed ||= !lint.ok || !diff.ok;
  }
  if (files.length === 0 && args.staged) return 0;
  return failed ? 1 : 0;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
