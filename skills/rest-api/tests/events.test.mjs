import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { lint, codes, fixture, root } from './helpers.mjs';

const base = () => YAML.parse(fixture('event-type.yaml'));
const payload = (et) => JSON.parse(et.schema.schema);
const setPayload = (et, s) => { et.schema.schema = JSON.stringify(s); };
const withPayload = (change) => (et) => { const s = payload(et); change(s); setPayload(et, s); };
const opts = { ruleset: 'event-types.yaml', source: 'order-placed.yaml' };

const CASES = [
  ['zalando-197-event-type-fields', 'no audience', (et) => { delete et.audience; }],
  ['zalando-197-event-type-fields', 'a schema that is not JSON', (et) => { et.schema.schema = '{"type": '; }],
  ['zalando-213-event-type-name', 'an application name for an external audience', (et) => { et.audience = 'external-partner'; et.name = 'orders.order-placed'; }],
  ['zalando-213-event-type-name', 'a camelCase name', (et) => { et.name = 'order-sales-order.orderPlaced'; }],
  ['zalando-207-event-ownership', 'no owning application', (et) => { delete et.owning_application; }],
  ['zalando-245-compatibility-mode', 'no compatibility mode', (et) => { delete et.compatibility_mode; }],
  ['zalando-198-event-category', 'an unknown category', (et) => { et.category = 'audit'; }],
  ['zalando-198-event-category', 'a metadata field in the payload', withPayload((s) => { s.properties.metadata = { type: 'object' }; })],
  ['zalando-196-openapi-schema-object', 'oneOf', withPayload((s) => { s.properties.channel = { oneOf: [{ type: 'string' }, { type: 'integer', format: 'int32' }] }; })],
  ['zalando-210-no-additional-properties', 'additionalProperties: true', withPayload((s) => { s.additionalProperties = true; })],
  ['zalando-246-schema-version', 'a non-semver version', (et) => { et.schema.version = 'v1'; }],
  ['zalando-242-data-change-ordering', 'a data change event without ordering', (et) => { et.category = 'data'; delete et.ordering_key_fields; }],
  ['zalando-203-general-ordering', 'a general event without ordering', (et) => { delete et.ordering_key_fields; }],
  ['zalando-204-hash-partitioning', 'a data change event partitioned at random', (et) => { et.category = 'data'; et.partition_strategy = 'random'; }],
  ['zalando-200-sensitive-data', 'an email in the payload', withPayload((s) => { s.properties.email = { type: 'string', format: 'email' }; })],
  ['zalando-208-api-guidelines', 'a camelCase payload field', withPayload((s) => { s.properties.orderNumber = { type: 'string' }; })],
  ['zalando-208-api-guidelines', 'a numeric timestamp', withPayload((s) => { s.properties.placed_at = { type: 'integer', format: 'int64' }; })],
  ['zalando-208-api-guidelines', 'x-extensible-enum', withPayload((s) => { s.properties.channel = { type: 'string', 'x-extensible-enum': ['WEB'] }; })],
  ['zalando-208-api-guidelines-should', 'a singular array name', withPayload((s) => { s.properties.tag = { type: 'array', items: { type: 'string' } }; })],
];

test('the compliant event type has no findings', async () => {
  const results = await lint(base(), opts);
  assert.deepEqual(results, [], results.map((r) => `${r.code}: ${r.message}`).join('\n'));
});

for (const [code, name, change] of CASES) {
  test(`${code}: ${name}`, async () => {
    const et = base();
    change(et);
    const found = codes(await lint(et, opts));
    assert.ok(found.includes(code), `expected ${code}, got ${found.join(', ') || 'nothing'}`);
  });
}

test('every event rule has a failing case', () => {
  const rules = Object.keys(YAML.parse(fs.readFileSync(path.join(root, 'ruleset', 'event-types.yaml'), 'utf8')).rules);
  const tested = new Set(CASES.map((c) => c[0]));
  assert.deepEqual(rules.filter((r) => !tested.has(r)), []);
});
