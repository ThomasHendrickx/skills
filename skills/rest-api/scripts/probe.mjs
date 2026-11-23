#!/usr/bin/env node
// Checks a running service against its OpenAPI spec for the rules only behaviour can show:
// #104 #109 #110 #118 #122 #124 #136 #151 #153 #156 #166 #167 #169 #176 #177 #178 #189 #192 #217 #227 #233.
//
//   node probe.mjs <spec> --base-url <url> [--header "Authorization: Bearer ..."] [--param name=value]
//                  [--spec-url <url>] [--write-probes] [--format text|json]
//
// By default it only sends GET requests and requests to unknown paths. --write-probes also sends invalid
// POST, PUT and PATCH requests (malformed body, unsupported media type); use it against a test environment.
// Path parameters come from --param or from the spec's examples; operations without them are not run.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import YAML from 'yaml';
import { isObj, deref, operations, parameters, responses, mediaTypes, headers as responseHeaders, typesOf, exampleValues, isJsonMediaType, isProblemMediaType, isParamSegment, pathSegments } from '../ruleset/functions/lib/oas.js';
import { looksLikeStackTrace } from '../ruleset/functions/lib/stacktrace.js';
import { DO_NOT_DOCUMENT_STATUS } from '../ruleset/functions/lib/words.js';

const usage = 'usage: probe.mjs <spec> --base-url <url> [--header "Name: value"]... [--param name=value]... [--spec-url <url>] [--write-probes] [--format text|json]';

export function parseArgs(argv) {
  const args = { headers: {}, params: {}, format: 'text', writeProbes: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--base-url') args.baseUrl = argv[(i += 1)];
    else if (a === '--spec-url') args.specUrl = argv[(i += 1)];
    else if (a === '--format') args.format = argv[(i += 1)];
    else if (a === '--write-probes') args.writeProbes = true;
    else if (a === '--header') {
      const h = argv[(i += 1)] ?? '';
      const at = h.indexOf(':');
      if (at < 1) throw new Error(`bad --header "${h}"`);
      args.headers[h.slice(0, at).trim()] = h.slice(at + 1).trim();
    } else if (a === '--param') {
      const p = argv[(i += 1)] ?? '';
      const at = p.indexOf('=');
      if (at < 1) throw new Error(`bad --param "${p}"`);
      args.params[p.slice(0, at)] = p.slice(at + 1);
    } else if (!args.spec) args.spec = a;
    else throw new Error(usage);
  }
  if (!args.spec || !args.baseUrl || !['text', 'json'].includes(args.format)) throw new Error(usage);
  return args;
}

const flowId = () => crypto.randomBytes(16).toString('base64url');

async function send(url, { method = 'GET', headers = {}, body } = {}) {
  const res = await fetch(url, { method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(15000) });
  const text = await res.text();
  const h = Object.fromEntries([...res.headers.entries()].map(([k, v]) => [k.toLowerCase(), v]));
  let json;
  if (text && /json/i.test(h['content-type'] ?? '')) {
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
  }
  return { status: res.status, headers: h, text, json, url };
}

// --- spec lookups --------------------------------------------------------------------------------------
function documentedResponse(doc, op, status) {
  const all = [...responses(doc, op)];
  const code = String(status);
  return all.find((r) => r.code === code) ?? all.find((r) => r.code.toUpperCase() === `${code[0]}XX`) ?? all.find((r) => r.code === 'default');
}

function exampleOf(doc, param) {
  const { node: s } = deref(doc, param.schema);
  const values = [...exampleValues(param), ...exampleValues(s ?? {})];
  if (isObj(param.examples)) for (const e of Object.values(param.examples)) if (isObj(e) && 'value' in e) values.push(e.value);
  if (Array.isArray(s?.enum)) values.push(...s.enum);
  return values.find((v) => v !== undefined && v !== null && typeof v !== 'object');
}

function buildUrl(base, doc, op, given) {
  let path = op.path;
  for (const seg of pathSegments(op.path).filter(isParamSegment)) {
    const name = seg.slice(1, -1);
    const param = parameters(doc, op).find((p) => p.param.in === 'path' && p.param.name === name)?.param;
    const value = given[name] ?? (param ? exampleOf(doc, param) : undefined);
    if (value === undefined) return undefined;
    path = path.replace(seg, encodeURIComponent(String(value)));
  }
  const required = parameters(doc, op).filter((p) => p.param.in === 'query' && p.param.required);
  const query = new URLSearchParams();
  for (const { param } of required) {
    const value = given[param.name] ?? exampleOf(doc, param);
    if (value === undefined) return undefined;
    query.set(param.name, String(value));
  }
  const q = query.toString();
  return `${base.replace(/\/$/, '')}${path}${q ? `?${q}` : ''}`;
}

const jsonSchemaOf = (doc, response) => {
  for (const m of mediaTypes(response, [])) if (isJsonMediaType(m.type) && m.media.schema) return m.media.schema;
  return undefined;
};

// Walks a JSON value along its schema: visit(value, schema, path, { declaredKey, inMap }).
function walk(doc, schemaRaw, value, path, visit, depth = 0) {
  const schema = deref(doc, schemaRaw).node;
  visit(value, isObj(schema) ? schema : undefined, path);
  if (depth > 25 || value === null || typeof value !== 'object') return;
  const sub = (k) => {
    if (!isObj(schema)) return undefined;
    const props = { ...(schema.properties ?? {}) };
    for (const part of schema.allOf ?? []) Object.assign(props, deref(doc, part).node?.properties ?? {});
    return props[k];
  };
  if (Array.isArray(value)) {
    value.forEach((v, i) => walk(doc, isObj(schema) ? schema.items : undefined, v, `${path}[${i}]`, visit, depth + 1));
    return;
  }
  for (const [k, v] of Object.entries(value)) {
    const declared = sub(k);
    const map = !declared && isObj(schema) && isObj(schema.additionalProperties) ? schema.additionalProperties : undefined;
    if (!declared && !map && !/^[a-z_][a-z_0-9]*$/.test(k)) visit(undefined, undefined, `${path}.${k}`, { badKey: k });
    walk(doc, declared ?? map, v, `${path}.${k}`, visit, depth + 1);
  }
}

// --- checks on one response ------------------------------------------------------------------------------
const PAGE_LINKS = new Set(['self', 'first', 'prev', 'next', 'last']);
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const HTTP_DATE = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/;

export function checkResponse(doc, op, res, report) {
  const where = op ? `${op.method.toUpperCase()} ${op.path}` : `GET ${new URL(res.url).pathname}`;
  const f = (level, rule, message) => report({ level, rule, where, message: `${message} (HTTP ${res.status})` });
  const type = res.headers['content-type'] ?? '';
  const documented = op ? documentedResponse(doc, op, res.status) : undefined;
  if (op && !documented && !DO_NOT_DOCUMENT_STATUS.has(String(res.status))) f('error', '151', `status ${res.status} is not specified for this operation`);
  if (res.text && !type) f('error', '178', 'the response has a body but no Content-Type');
  if (/json/i.test(type)) {
    if (res.json === undefined) f('error', '167', 'the body is not valid JSON');
    const charset = /charset=([^;]+)/i.exec(type)?.[1];
    if (charset && !/^"?utf-8"?$/i.test(charset.trim())) f('error', '167', `JSON must be UTF-8, not ${charset}`);
  }
  if (looksLikeStackTrace(res.text) || strings(res.json).some(looksLikeStackTrace)) f('error', '177', 'the body contains a stack trace');
  if (res.status >= 400) {
    if (res.text) {
      if (!/^application\/problem\+json/i.test(type)) f('error', '176', `errors return application/problem+json, not ${type || 'no content type'}`);
      else if (!isObj(res.json)) f('error', '176', 'the Problem is not a JSON object');
      else {
        const want = { type: 'string', title: 'string', status: 'number', detail: 'string', instance: 'string' };
        for (const [k, t] of Object.entries(want)) if (k in res.json && typeof res.json[k] !== t) f('error', '176', `Problem field "${k}" must be a ${t === 'number' ? 'integer' : t}`);
      }
    }
  } else if (res.status >= 200 && res.status < 300 && res.json !== undefined && !isProblemMediaType(type) && (typeof res.json !== 'object' || Array.isArray(res.json) || res.json === null)) {
    f('error', '110', 'return a JSON object at the top level');
  }
  if (res.json !== undefined) {
    const schema = documented ? jsonSchemaOf(doc, documented.response) : undefined;
    const requestHost = new URL(res.url).host;
    walk(doc, schema, res.json, '$', (value, s, path, info) => {
      if (info?.badKey) f('error', '118', `property "${info.badKey}" at ${path} is not snake_case`);
      if (!s) return;
      const t = typesOf(s);
      if (value === null && t.has('boolean')) f('error', '122', `boolean ${path} is null`);
      if (value === null && t.has('array')) f('warn', '124', `array ${path} is null; return []`);
      if (s.format === 'date-time' && typeof value === 'string' && !DATE_TIME.test(value)) f('error', '169', `${path} = "${value}" is not an RFC 3339 date-time with upper-case T and Z`);
    });
    walkLinks(res.json, '$', (path, url) => {
      if (!/^https?:\/\//i.test(url)) f('error', '217', `link ${path} = "${url}" is not an absolute URI`);
      else if (new URL(url).host !== requestHost) f('warn', '217', `link ${path} points to ${new URL(url).host}, not the requested host ${requestHost}`);
    });
    if (res.headers.link) f('error', '166', 'a Link header comes with a JSON body; embed links in the payload');
  }
  if (res.status === 429 && !res.headers['retry-after'] && !['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset'].every((h) => res.headers[h])) {
    f('error', '153', '429 without Retry-After or the X-RateLimit headers');
  }
  if (op?.op.deprecated && res.status < 300) {
    if (!res.headers.deprecation) f('warn', '189', 'the operation is deprecated but the response has no Deprecation header');
  }
  if (res.headers.deprecation && !/^(@\d+|true)$/.test(res.headers.deprecation.trim())) f('error', '189', `Deprecation "${res.headers.deprecation}" is neither @<unix-seconds> nor true`);
  if (res.headers.sunset && !HTTP_DATE.test(res.headers.sunset.trim())) f('error', '189', `Sunset "${res.headers.sunset}" is not an HTTP date`);
  if (op && res.status < 300 && ['get', 'head', 'post'].includes(op.method)) {
    const declared = documented && [...responseHeaders(doc, documented.response, [])].some((h) => h.name.toLowerCase() === 'cache-control');
    const cc = (res.headers['cache-control'] ?? '').toLowerCase();
    const cacheable = /\b(public|max-age=[1-9]|s-maxage=[1-9])/.test(cc) && !/no-store/.test(cc);
    if (cacheable && !declared) f('error', '227', `Cache-Control "${cc}" allows caching, but the spec does not document this endpoint as cacheable`);
    if (!cc && !declared) f('warn', '227', 'send Cache-Control: no-store (the default for endpoints not documented as cacheable)');
  }
}

const strings = (v) => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : []);

function walkLinks(value, path, visit, key) {
  if (typeof value === 'string') {
    if (key === 'href' || (PAGE_LINKS.has(key) && /[/:]/.test(value))) visit(path, value);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) value.forEach((v, i) => walkLinks(v, `${path}[${i}]`, visit));
  else for (const [k, v] of Object.entries(value)) walkLinks(v, `${path}.${k}`, visit, k);
}

// --- the run -----------------------------------------------------------------------------------------
export async function probe(doc, args) {
  const findings = [];
  const report = (f) => findings.push(f);
  const notRun = [];
  const base = {
    accept: 'application/json, application/problem+json',
    'accept-encoding': 'gzip',
    ...Object.fromEntries(Object.entries(args.headers).map(([k, v]) => [k.toLowerCase(), v])),
  };
  const withFlow = () => ({ ...base, 'x-flow-id': flowId() });
  const root = args.baseUrl.replace(/\/$/, '');

  if (args.specUrl) {
    try {
      const res = await send(args.specUrl, { headers: base });
      const published = res.status === 200 ? YAML.parse(res.text) : undefined;
      if (!published) report({ level: 'error', rule: '192', where: args.specUrl, message: `the published spec is not available (HTTP ${res.status})` });
      else if (published.info?.version !== doc.info?.version) report({ level: 'error', rule: '192', where: args.specUrl, message: `the published spec has version ${published.info?.version}, the local one ${doc.info?.version}` });
    } catch (e) {
      report({ level: 'error', rule: '192', where: args.specUrl, message: `the published spec cannot be read: ${e.message}` });
    }
  }

  const unknown = await send(`${root}/zz-probe-${crypto.randomBytes(4).toString('hex')}`, { headers: withFlow() });
  checkResponse(doc, undefined, unknown, report);

  for (const op of operations(doc)) {
    const where = `${op.method.toUpperCase()} ${op.path}`;
    const url = buildUrl(root, doc, op, args.params);
    if (!url) {
      if (op.method === 'get' || args.writeProbes) notRun.push({ where, reason: 'no example or --param for a path or required query parameter' });
      continue;
    }
    if (op.method === 'get') await probeRead(doc, op, url, { base, withFlow, report, args });
    else if (args.writeProbes && ['post', 'put', 'patch'].includes(op.method)) await probeWrite(doc, op, url, { withFlow, report });
  }
  return { findings, notRun };
}

async function probeRead(doc, op, url, { base, withFlow, report, args }) {
  const where = `${op.method.toUpperCase()} ${op.path}`;
  const res = await send(url, { headers: withFlow() });
  checkResponse(doc, op, res, report);
  if (res.status === 400 || res.status === 431) {
    const plain = await send(url, { headers: base });
    if (plain.status < 300) report({ level: 'error', rule: '233', where, message: `a request with an X-Flow-ID header is rejected (${res.status}) while one without it succeeds` });
  }
  if (res.status >= 300) return;
  if (res.text.length >= 1024 && !res.headers['content-encoding']) report({ level: 'warn', rule: '156', where, message: `a ${res.text.length} byte response is not gzip compressed although the client accepts gzip` });
  const identity = await send(url, { headers: { ...withFlow(), 'accept-encoding': 'identity' } });
  if (identity.headers['content-encoding'] && identity.headers['content-encoding'] !== 'identity') report({ level: 'error', rule: '156', where, message: `Accept-Encoding: identity still gets Content-Encoding ${identity.headers['content-encoding']}; unencoded content must stay available` });
  if (op.op.security !== undefined ? op.op.security.length > 0 : (doc.security ?? []).length > 0) {
    const auth = Object.keys(args.headers).find((h) => h.toLowerCase() === 'authorization');
    if (auth) {
      const anonymous = { ...withFlow() };
      delete anonymous.authorization;
      const anon = await send(url, { headers: anonymous });
      if (anon.status < 400) report({ level: 'error', rule: '104', where, message: `answers ${anon.status} without credentials; the endpoint must be secured` });
      else checkResponse(doc, op, anon, report);
    }
  }
  const slash = await send(`${url.replace(/(\?|$)/, '/$1')}`, { headers: withFlow() });
  if (slash.status >= 200 && slash.status < 300 && slash.text !== res.text) report({ level: 'error', rule: '136', where, message: 'the path with a trailing slash returns a different resource; serve the same or reject it' });
  const sep = url.includes('?') ? '&' : '?';
  const extra = await send(`${url}${sep}zz_probe_unknown=1`, { headers: withFlow() });
  if (extra.status < 300) report({ level: 'warn', rule: '109', where, message: 'an unknown query parameter is ignored; answer 400' });
  else checkResponse(doc, op, extra, report);
  const bounded = parameters(doc, op).find((p) => p.param.in === 'query' && typeof deref(doc, p.param.schema).node?.minimum === 'number');
  if (bounded) {
    const min = deref(doc, bounded.param.schema).node.minimum;
    const bad = await send(`${url}${sep}${encodeURIComponent(bounded.param.name)}=${min - 1}`, { headers: withFlow() });
    if (bad.status >= 500) report({ level: 'error', rule: '176', where, message: `an out-of-range ${bounded.param.name} gives ${bad.status}; reject it with 400 and a Problem` });
    else if (bad.status < 400) report({ level: 'warn', rule: '109', where, message: `${bounded.param.name}=${min - 1} is accepted although its minimum is ${min}` });
    checkResponse(doc, op, bad, report);
  }
}

async function probeWrite(doc, op, url, { withFlow, report }) {
  const where = `${op.method.toUpperCase()} ${op.path}`;
  const broken = await send(url, { method: op.method.toUpperCase(), headers: { ...withFlow(), 'content-type': 'application/json' }, body: '{"zz_probe": ' });
  checkResponse(doc, op, broken, report);
  if (broken.status < 400 || broken.status >= 500) report({ level: 'error', rule: '176', where, message: `malformed JSON gives ${broken.status}; reject it with 400 and a Problem` });
  const plain = await send(url, { method: op.method.toUpperCase(), headers: { ...withFlow(), 'content-type': 'text/plain' }, body: 'zz-probe' });
  checkResponse(doc, op, plain, report);
  if (plain.status !== 415) report({ level: plain.status >= 500 || plain.status < 300 ? 'error' : 'warn', rule: '220', where, message: `an unsupported media type gives ${plain.status}; answer 415` });
}

export function render({ findings, notRun }, format) {
  if (format === 'json') return JSON.stringify({ findings, notRun }, null, 2);
  const seen = new Set();
  const order = { error: 0, warn: 1, info: 2 };
  const lines = [...findings].sort((a, b) => order[a.level] - order[b.level]).map((f) => `${f.level.padEnd(5)} #${f.rule.padEnd(4)}${f.where}: ${f.message}`).filter((l) => !seen.has(l) && seen.add(l));
  for (const n of notRun) lines.push(`not run   ${n.where}: ${n.reason}`);
  lines.push(`${findings.filter((f) => f.level === 'error').length} error(s), ${findings.filter((f) => f.level === 'warn').length} warning(s), ${notRun.length} operation(s) not run`);
  return lines.join('\n');
}

export async function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    console.error(e.message);
    return 2;
  }
  const doc = YAML.parse(fs.readFileSync(args.spec, 'utf8'), { maxAliasCount: -1 });
  const result = await probe(doc, args);
  console.log(render(result, args.format));
  return result.findings.some((f) => f.level === 'error') ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
