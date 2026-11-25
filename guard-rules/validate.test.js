import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { guardRuleSetSchema } from '@aeolus-fleet/common';
import { parse } from 'yaml';

for (const name of ['base', 'no-push']) {
  test(`${name} is a valid guard rule set`, async () => {
    const source = await readFile(new URL(`${name}.yaml`, import.meta.url));
    assert.ok(source.length <= 64 * 1024);
    const rules = guardRuleSetSchema.parse(parse(source.toString()));
    assert.equal(rules.name, name);
    if (name === 'base') {
      for (const action of ['force-push', 'rewrite-history', 'delete-branch']) {
        assert.ok(rules.rules.git.deny.includes(action));
      }
      assert.ok(rules.rules.writePaths.deny.includes('guard-rules/**'));
    } else {
      assert.ok(rules.rules.git.deny.includes('push'));
    }
  });
}
