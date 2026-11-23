import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import core from '@stoplight/spectral-core';
import Parsers from '@stoplight/spectral-parsers';
import loader from '@stoplight/spectral-ruleset-bundler/with-loader';
import runtime from '@stoplight/spectral-runtime';
import YAML from 'yaml';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const fixture = (name) => fs.readFileSync(path.join(root, 'tests', 'fixtures', name), 'utf8');

const { Spectral, Document } = core;
const { bundleAndLoadRuleset } = loader;
const { fetch } = runtime;

const cache = new Map();
async function spectralFor(rulesetFile) {
  if (!cache.has(rulesetFile)) {
    const ruleset = await bundleAndLoadRuleset(path.join(root, 'ruleset', rulesetFile), { fs, fetch });
    const s = new Spectral();
    s.setRuleset(ruleset);
    cache.set(rulesetFile, s);
  }
  return cache.get(rulesetFile);
}

// Lints a document (object or YAML text) and returns [{ code, path, message, severity }].
export async function lint(doc, { ruleset = 'rest-api.yaml', source = 'openapi.yaml' } = {}) {
  const text = typeof doc === 'string' ? doc : YAML.stringify(doc, { aliasDuplicateObjects: false });
  const spectral = await spectralFor(ruleset);
  const results = await spectral.run(new Document(text, Parsers.Yaml, source));
  return results.map((r) => ({ code: String(r.code), path: r.path.join('.'), message: r.message, severity: r.severity }));
}

export const codes = (results) => [...new Set(results.map((r) => r.code))].sort();

// The compliant fixture as an object, deep-copied, to change one thing per test.
export const good = () => YAML.parse(fixture('good.yaml'));
