import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import YAML from 'yaml';
import { good, root } from './helpers.mjs';
import { specFindings, eventFindings } from '../scripts/diff.mjs';

const P = (d, name) => d.components.schemas[name].properties;
const errors = (f) => f.filter((x) => x.level === 'error');
const has = (f, level, rule, text) => f.some((x) => x.level === level && x.rule === rule && (!text || `${x.where} ${x.message}`.includes(text)));
const diff = (change, version) => {
  const base = good();
  const next = good();
  change(next, base);
  if (version) next.info.version = version;
  return specFindings(base, next, { today: '2026-11-23' });
};
const show = (f) => f.map((x) => `${x.level} #${x.rule} ${x.where}: ${x.message}`).join('\n');

test('no change, no findings', () => {
  assert.deepEqual(diff(() => {}), []);
});

test('#116: an addition without a MINOR bump fails', () => {
  const f = diff((d) => { P(d, 'SalesOrder').note = { type: 'string', maxLength: 99 }; });
  assert.ok(has(f, 'error', '116', 'MINOR'), show(f));
  assert.ok(has(f, 'info', '107', 'note'), show(f));
});

test('#116: an addition with a MINOR bump passes', () => {
  const f = diff((d) => { P(d, 'SalesOrder').note = { type: 'string', maxLength: 99 }; }, '1.5.0');
  assert.deepEqual(errors(f), [], show(f));
});

test('#106 and #187: removing a field is breaking, and needs a deprecation first', () => {
  const f = diff((d) => { delete P(d, 'SalesOrder').tags; }, '1.5.0');
  assert.ok(has(f, 'error', '106', 'property "tags" removed'), show(f));
  assert.ok(has(f, 'error', '187', 'tags'), show(f));
  assert.ok(has(f, 'error', '116', 'MAJOR'), show(f));
});

test('#106: a MAJOR bump accepts a breaking change; #187 still needs the deprecation', () => {
  const f = diff((d) => { delete P(d, 'SalesOrder').tags; }, '2.0.0');
  assert.ok(has(f, 'warn', '106', 'tags'), show(f));
  assert.ok(has(f, 'error', '187'), show(f));
});

test('#185: a deprecated field removed after its sunset passes with a MAJOR bump', () => {
  const f = diff((d, base) => {
    Object.assign(P(base, 'SalesOrder').tags, { deprecated: true, description: 'Use labels.', 'x-sunset': '2026-06-30' });
    delete P(d, 'SalesOrder').tags;
  }, '2.0.0');
  assert.deepEqual(errors(f), [], show(f));
});

test('#185: removing a deprecated field before its sunset fails', () => {
  const f = diff((d, base) => {
    Object.assign(P(base, 'SalesOrder').tags, { deprecated: true, description: 'Use labels.', 'x-sunset': '2027-06-30' });
    delete P(d, 'SalesOrder').tags;
  }, '2.0.0');
  assert.ok(has(f, 'error', '185', '2027-06-30'), show(f));
});

test('#106: a value added to a closed enum in a response is breaking', () => {
  const f = diff((d, base) => {
    P(base, 'SalesOrderPage').state = { type: 'string', enum: ['OPEN', 'DONE'] };
    P(d, 'SalesOrderPage').state = { type: 'string', enum: ['OPEN', 'DONE', 'HELD'] };
  }, '1.5.0');
  assert.ok(has(f, 'error', '106', 'HELD'), show(f));
});

test('#107: a value added to an extensible enum is an addition', () => {
  const f = diff((d) => { P(d, 'SalesOrder').status.examples.push('RETURNED'); }, '1.5.0');
  assert.deepEqual(errors(f), [], show(f));
  assert.ok(has(f, 'info', '107', 'RETURNED'), show(f));
});

test('#106: a value removed from an extensible enum that clients send is breaking', () => {
  const f = diff((d) => { P(d, 'SalesOrder').status.examples.pop(); }, '1.5.0');
  assert.ok(has(f, 'error', '106', 'DELIVERED'), show(f));
});

test('#106: a new required query parameter is breaking', () => {
  const f = diff((d) => { d.paths['/sales-orders'].get.parameters.push({ name: 'channel', in: 'query', required: true, schema: { type: 'string', maxLength: 9 } }); }, '1.5.0');
  assert.ok(has(f, 'error', '106', 'channel'), show(f));
});

test('#106: an input field made required is breaking', () => {
  const f = diff((d) => { d.components.schemas.SalesOrder.required.push('tags'); }, '1.5.0');
  assert.ok(has(f, 'error', '106', 'became required'), show(f));
});

test('#106: a tightened input constraint is breaking', () => {
  const f = diff((d) => { P(d, 'SalesOrder').customer_number.maxLength = 16; }, '1.5.0');
  assert.ok(has(f, 'error', '106', 'maxLength'), show(f));
});

test('#106: an output field no longer always present is breaking', () => {
  const f = diff((d) => { d.components.schemas.SalesOrderPage.required = []; }, '1.5.0');
  assert.ok(has(f, 'error', '106', 'no longer always present'), show(f));
});

test('#106: a response field that can now be null is breaking', () => {
  const f = diff((d) => { P(d, 'SalesOrderPage').next.type = ['string', 'null']; }, '1.5.0');
  assert.ok(has(f, 'error', '106', 'null'), show(f));
});

test('#106: a changed output type is breaking', () => {
  const f = diff((d) => { P(d, 'SalesOrder').item_count = { type: 'string', maxLength: 9 }; }, '1.5.0');
  assert.ok(has(f, 'error', '106', 'type changed'), show(f));
});

test('#106 and #187: removing an operation without deprecation fails', () => {
  const f = diff((d) => { delete d.paths['/sales-orders/{sales-order-id}'].delete; }, '2.0.0');
  assert.ok(has(f, 'warn', '106', 'DELETE'), show(f));
  assert.ok(has(f, 'error', '187', 'DELETE'), show(f));
});

test('#107: a new operation needs a MINOR bump', () => {
  const f = diff((d) => { d.paths['/sales-orders/{sales-order-id}'].put = d.paths['/sales-orders/{sales-order-id}'].patch; });
  assert.ok(has(f, 'error', '116', 'MINOR'), show(f));
});

test('#106: a new required scope is breaking', () => {
  const f = diff((d) => { d.security = [{ BearerAuth: ['sales-order.read', 'sales-order.admin'] }]; }, '1.5.0');
  assert.ok(has(f, 'error', '106', 'security'), show(f));
});

test('a renamed path parameter is the same operation', () => {
  const f = diff((d) => {
    d.paths['/sales-orders/{id}'] = d.paths['/sales-orders/{sales-order-id}'];
    delete d.paths['/sales-orders/{sales-order-id}'];
    d.components.parameters.SalesOrderId.name = 'id';
  });
  assert.deepEqual(f, [], show(f));
});

test('#116: the version cannot go down', () => {
  const f = diff(() => {}, '1.3.0');
  assert.ok(has(f, 'error', '116', 'went down'), show(f));
});

test('#215: the API identifier is immutable', () => {
  const base = good();
  const next = good();
  base.info['x-api-id'] = 'aaaaaaaa-0000-0000-0000-000000000001';
  next.info['x-api-id'] = 'aaaaaaaa-0000-0000-0000-000000000002';
  assert.ok(has(specFindings(base, next, { today: '2026-11-23' }), 'error', '215'));
});

test('0.y.z: a breaking change needs a MINOR bump only', () => {
  const base = good();
  const next = good();
  base.info.version = '0.3.0';
  next.info.version = '0.4.0';
  delete P(next, 'SalesOrder').tags;
  const f = specFindings(base, next, { today: '2026-11-23' });
  assert.deepEqual(errors(f), [], show(f));
});

const eventType = (schema, version = '1.0.0', mode = 'compatible') => ({
  name: 'order-sales-order.order-placed', owning_application: 'order-service', category: 'general', compatibility_mode: mode,
  schema: { type: 'json_schema', version, schema: JSON.stringify(schema) },
});
const orderPlaced = () => ({ type: 'object', required: ['order_number'], properties: { order_number: { type: 'string' }, channel: { type: 'string', enum: ['WEB', 'APP'] } } });

test('#246: an optional event field is a MINOR change', () => {
  const s = orderPlaced();
  s.properties.note = { type: 'string' };
  assert.deepEqual(errors(eventFindings(eventType(orderPlaced()), eventType(s, '1.1.0'))), []);
  assert.ok(has(eventFindings(eventType(orderPlaced()), eventType(s, '1.0.0')), 'error', '246', 'MINOR'));
});

test('#209: a required event field is incompatible in compatible mode', () => {
  const s = orderPlaced();
  s.properties.note = { type: 'string' };
  s.required.push('note');
  const f = eventFindings(eventType(orderPlaced()), eventType(s, '2.0.0'));
  assert.ok(has(f, 'error', '209', 'note'), show(f));
});

test('#209: an enum value added to an event is incompatible', () => {
  const s = orderPlaced();
  s.properties.channel.enum.push('STORE');
  assert.ok(has(eventFindings(eventType(orderPlaced()), eventType(s, '1.1.0')), 'error', '209', 'STORE'));
});

test('#246: compatibility mode none allows a breaking change with a MAJOR bump', () => {
  const s = orderPlaced();
  delete s.properties.channel;
  const f = eventFindings(eventType(orderPlaced(), '1.0.0', 'none'), eventType(s, '2.0.0', 'none'));
  assert.deepEqual(errors(f), [], show(f));
});

test('the command line compares with a git ref and exits 1 on errors', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rest-api-diff-'));
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' });
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  fs.writeFileSync(path.join(dir, 'openapi.yaml'), YAML.stringify(good()));
  git('add', '.');
  git('commit', '-qm', 'base');
  const next = good();
  delete P(next, 'SalesOrder').tags;
  fs.writeFileSync(path.join(dir, 'openapi.yaml'), YAML.stringify(next));
  const run = spawnSync('node', [path.join(root, 'scripts', 'diff.mjs'), '--base', 'HEAD', 'openapi.yaml'], { cwd: dir, encoding: 'utf8' });
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stdout, /#106 .*tags/);
  const same = spawnSync('node', [path.join(root, 'scripts', 'diff.mjs'), 'openapi.yaml', 'openapi.yaml', '--format', 'json'], { cwd: dir, encoding: 'utf8' });
  assert.equal(same.status, 0, same.stderr);
  assert.deepEqual(JSON.parse(same.stdout), []);
});
