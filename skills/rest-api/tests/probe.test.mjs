import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import zlib from 'node:zlib';
import { good } from './helpers.mjs';
import { probe } from '../scripts/probe.mjs';

const problem = (res, status, detail, flaws) => {
  const body = { type: '/problems/probe', title: 'Probe error', status, detail };
  if (flaws.has('stack')) {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ...body, detail: 'java.lang.IllegalStateException\n\tat com.shop.Orders.read(Orders.java:42)' }));
    return;
  }
  res.writeHead(status, { 'content-type': 'application/problem+json' });
  res.end(JSON.stringify(body));
};

// A small sales order service; each flaw breaks one rule.
function service(flaws = new Set()) {
  return http.createServer((req, res) => {
    const host = `http://${req.headers.host}`;
    const url = new URL(req.url, host);
    const send = (status, value, extra = {}) => {
      const text = JSON.stringify(value);
      const headers = { 'content-type': 'application/json', 'cache-control': flaws.has('cacheable') ? 'public, max-age=600' : 'no-store', ...extra };
      if (flaws.has('no-cc')) delete headers['cache-control'];
      const gzip = !flaws.has('no-gzip') && (flaws.has('always-gzip') || /gzip/.test(req.headers['accept-encoding'] ?? '')) && text.length >= 1024;
      if (gzip) headers['content-encoding'] = 'gzip';
      res.writeHead(status, headers);
      res.end(gzip ? zlib.gzipSync(text) : text);
    };
    if (flaws.has('flow-reject') && req.headers['x-flow-id']) return problem(res, 400, 'no flow ids', flaws);
    if (!flaws.has('open') && req.headers.authorization !== 'Bearer t') return problem(res, 401, 'Missing token', flaws);
    const order = (id) => ({
      id, customer_number: 'C-1', grand_total: { amount: 9.95, currency: 'EUR' },
      shipping_address: { street: 'Main Street 1', city: 'Leuven', zip: '3000', country_code: 'BE' },
      created_at: flaws.has('dates') ? '2026-11-23t08:00:00z' : '2026-11-23T08:00:00Z',
      is_gift: flaws.has('nulls') ? null : false, tags: ['a'],
      ...(flaws.has('camel') ? { customerName: 'Ann' } : {}),
    });
    const allowed = new Set(['cursor', 'limit']);
    if (!flaws.has('lenient') && [...url.searchParams.keys()].some((k) => !allowed.has(k))) return problem(res, 400, 'Unknown query parameter', flaws);
    const limit = url.searchParams.get('limit');
    if (limit !== null && !(Number(limit) >= 1 && Number(limit) <= 100)) return problem(res, 400, 'limit is out of range', flaws);
    if (req.method === 'GET' && url.pathname === '/sales-orders') {
      const page = { self: flaws.has('relative-links') ? '/sales-orders' : `${host}/sales-orders`, next: `${host}/sales-orders?cursor=abc`, items: Array.from({ length: 12 }, (_, i) => order(`so-${i}`)) };
      return send(200, flaws.has('array') ? page.items : page);
    }
    if (req.method === 'GET' && url.pathname === '/sales-orders/so-1234') return flaws.has('teapot') ? send(418, { tea: true }) : send(200, order('so-1234'));
    if (req.method === 'GET' && url.pathname === '/sales-orders/') return flaws.has('slash') ? send(200, { different: true }) : problem(res, 404, 'Not found', flaws);
    if (['POST', 'PATCH'].includes(req.method)) {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        if (!/json/.test(req.headers['content-type'] ?? '')) return problem(res, 415, 'Use JSON', flaws);
        try {
          JSON.parse(body);
        } catch {
          return flaws.has('500-on-bad-json') ? problem(res, 500, 'parser crashed', flaws) : problem(res, 400, 'Malformed JSON', flaws);
        }
        return send(201, order('so-new'));
      });
      return undefined;
    }
    return problem(res, 404, 'Not found', flaws);
  });
}

async function run(flaws, extra = {}, doc = good()) {
  const server = service(new Set(flaws));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  try {
    return await probe(doc, { baseUrl: `http://127.0.0.1:${port}`, headers: { Authorization: 'Bearer t' }, params: {}, writeProbes: true, ...extra });
  } finally {
    server.close();
  }
}

const show = (r) => r.findings.map((f) => `${f.level} #${f.rule} ${f.where}: ${f.message}`).join('\n');

test('a compliant service has no findings', async () => {
  const r = await run([]);
  assert.deepEqual(r.findings, [], show(r));
  assert.deepEqual(r.notRun, []);
});

const CASES = [
  ['camel', 'error', '118'],
  ['stack', 'error', '177'],
  ['stack', 'error', '176'],
  ['relative-links', 'error', '217'],
  ['no-cc', 'warn', '227'],
  ['cacheable', 'error', '227'],
  ['no-gzip', 'warn', '156'],
  ['always-gzip', 'error', '156'],
  ['open', 'error', '104'],
  ['slash', 'error', '136'],
  ['lenient', 'warn', '109'],
  ['teapot', 'error', '176'],
  ['nulls', 'error', '122'],
  ['dates', 'error', '169'],
  ['array', 'error', '110'],
  ['flow-reject', 'error', '233'],
  ['500-on-bad-json', 'error', '176'],
];

for (const [flaw, level, rule] of CASES) {
  test(`#${rule}: ${flaw}`, async () => {
    const r = await run([flaw]);
    assert.ok(r.findings.some((f) => f.level === level && f.rule === rule), show(r));
  });
}

test('#151: a status the operation does not specify', async () => {
  const doc = good();
  doc.paths['/sales-orders/{sales-order-id}'].get.responses = { 200: doc.paths['/sales-orders/{sales-order-id}'].get.responses['200'], 404: { $ref: '#/components/responses/Problem' } };
  const r = await run(['teapot'], {}, doc);
  assert.ok(r.findings.some((f) => f.level === 'error' && f.rule === '151' && /418/.test(f.message)), show(r));
});

test('#192: the published spec must match the local version', async () => {
  const spec = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'application/yaml' }); res.end('openapi: 3.1.0\ninfo:\n  version: 1.3.0\n'); });
  await new Promise((r) => spec.listen(0, '127.0.0.1', r));
  try {
    const r = await run([], { specUrl: `http://127.0.0.1:${spec.address().port}/openapi.yaml` });
    assert.ok(r.findings.some((f) => f.rule === '192' && /1\.3\.0/.test(f.message)), show(r));
  } finally {
    spec.close();
  }
});

test('operations without parameter examples are reported as not run', async () => {
  const server = service();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const doc = good();
  delete doc.components.parameters.SalesOrderId.schema.example;
  try {
    const r = await probe(doc, { baseUrl: `http://127.0.0.1:${server.address().port}`, headers: { Authorization: 'Bearer t' }, params: {}, writeProbes: false });
    assert.deepEqual(r.notRun.map((n) => n.where), ['GET /sales-orders/{sales-order-id}']);
  } finally {
    server.close();
  }
});
