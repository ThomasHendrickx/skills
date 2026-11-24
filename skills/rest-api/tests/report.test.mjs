import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';
import { good, root } from './helpers.mjs';
import { build } from '../scripts/report.mjs';

const spec = () => {
  const d = good();
  d.components.schemas.SalesOrder.properties.customerName = { type: 'string', maxLength: 9 };
  d.paths['/sales-orders'].get.parameters.push({ name: 'pageSize', in: 'query', schema: { type: 'integer', format: 'int32' } });
  delete d.externalDocs;
  return d;
};

function run(doc) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rest-api-report-'));
  fs.writeFileSync(path.join(dir, '.spectral.yaml'), `extends: [${path.join(root, 'ruleset', 'rest-api.yaml')}]\n`);
  fs.writeFileSync(path.join(dir, 'api.yaml'), YAML.stringify(doc));
  const r = spawnSync('node', [path.join(root, 'scripts', 'report.mjs'), 'api.yaml', '-o', 'report.html'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return fs.readFileSync(path.join(dir, 'report.html'), 'utf8');
}

test('a finding in a shared schema is placed on every endpoint that uses it, with the part', () => {
  const html = run(spec());
  assert.match(html, /request body, response 201 › schema SalesOrder › customerName/);
  assert.match(html, /response 200 › schema SalesOrder › customerName/);
  assert.match(html, /4 endpoints: GET \/sales-orders, POST \/sales-orders/);
});

test('findings are sorted by impact: MUST first, then the number of endpoints', () => {
  const findings = [
    { code: 'zalando-102-user-manual', severity: 1, path: [], message: 'x' },
    { code: 'zalando-130-snake-case-query', severity: 0, path: ['paths', '/sales-orders', 'get', 'parameters', '3', 'name'], message: 'y' },
    { code: 'zalando-118-snake-case-properties', severity: 0, path: ['components', 'schemas', 'SalesOrder', 'properties', 'customerName'], message: 'z' },
  ];
  const model = build(spec(), findings);
  assert.deepEqual(model.byRule.map((r) => r.code), ['zalando-118-snake-case-properties', 'zalando-130-snake-case-query', 'zalando-102-user-manual']);
  assert.equal(model.byRule[1].findings[0].part, 'parameter pageSize');
  assert.equal(model.general.length, 1);
});

test('the same spec gives the same page', () => {
  assert.equal(run(spec()), run(spec()));
});
