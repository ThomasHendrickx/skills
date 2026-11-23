import { isObj, deref, operations, responses, mediaTypes, headers, schemas, pathSegments, isParamSegment, isErrorCode, isSuccessCode, isProblemMediaType, isJsonMediaType, objectView, typesOf, words, finding } from '../lib/oas.js';
import { IANA_STATUS, COMMON_STATUS, DO_NOT_USE_STATUS, REDIRECT_STATUS, DO_NOT_DOCUMENT_STATUS, STATUS_METHODS, REASON_PHRASES } from '../lib/words.js';
import { looksLikeStackTrace, STACK_FIELDS, ERROR_STACK_FIELDS } from '../lib/stacktrace.js';

const label = (op) => `${op.method.toUpperCase()} ${op.path}`;
const isRange = (code) => /^[1-5]XX$/i.test(code);
const hasContent = (r) => isObj(r?.content) && Object.keys(r.content).length > 0;

// #243: only official (IANA registered) status codes.
export function officialStatusCodes(doc) {
  const out = [];
  for (const op of operations(doc)) {
    for (const code of Object.keys(op.op.responses ?? {})) {
      if (code !== 'default' && !isRange(code) && !IANA_STATUS.has(code)) out.push(finding(`${code} is not an official HTTP status code`, [...op.at, 'responses', code]));
    }
  }
  return out;
}

// #151: every operation specifies its success and its error responses.
export function successAndErrorResponses(doc) {
  const out = [];
  for (const op of operations(doc)) {
    const codes = Object.keys(op.op.responses ?? {});
    if (!codes.some((c) => isSuccessCode(c))) out.push(finding(`${label(op)} specifies no success (2xx) response`, [...op.at, 'responses']));
    if (!codes.some((c) => isErrorCode(c))) out.push(finding(`${label(op)} specifies no error response (4xx, 5xx or default)`, [...op.at, 'responses']));
  }
  return out;
}

const AVOID = { 422: 'use 400', 206: 'it is for range requests, not pagination', 205: 'it has no use in an API', 408: 'it has no use in an API', 417: 'it has no use in an API', 418: 'it is a joke', 424: 'it does not apply to REST', 505: 'it has no use in an API', 511: 'it has no use in an API' };

// #150: the commonly understood status codes.
export function commonStatusCodes(doc) {
  const out = [];
  for (const op of operations(doc)) {
    for (const code of Object.keys(op.op.responses ?? {})) {
      if (code === 'default' || isRange(code) || COMMON_STATUS.has(code) || REDIRECT_STATUS.has(code) || !IANA_STATUS.has(code)) continue;
      const why = AVOID[code] ?? (DO_NOT_USE_STATUS.has(code) ? 'the guideline advises against it' : 'it is not among the commonly understood codes');
      out.push(finding(`Avoid ${code}: ${why}`, [...op.at, 'responses', code]));
    }
  }
  return out;
}

// #150: status codes only on the methods they apply to.
export function statusCodeMethods(doc) {
  const out = [];
  for (const op of operations(doc)) {
    for (const code of Object.keys(op.op.responses ?? {})) {
      const allowed = STATUS_METHODS[code];
      if (allowed && !allowed.includes(op.method)) out.push(finding(`${code} does not apply to ${op.method.toUpperCase()} (only ${allowed.map((m) => m.toUpperCase()).join(', ')})`, [...op.at, 'responses', code]));
    }
  }
  return out;
}

const GENERIC = new Set(['error', 'an error occurred', 'unexpected error', 'server error', 'client error', 'failure', 'failed', 'internal error', 'access denied', 'unauthenticated', 'not authenticated', 'not authorized', 'invalid token', 'resource not found', 'the resource was not found', 'not allowed', 'rate limited', 'rate limit exceeded', 'conflict']);

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

// #150: codes with a well-known meaning are documented only with operation-specific details.
export function undocumentedStatusCodes(doc) {
  const out = [];
  for (const op of operations(doc)) {
    for (const r of responses(doc, op)) {
      if (!DO_NOT_DOCUMENT_STATUS.has(r.code)) continue;
      const d = norm(r.response.description);
      const phrase = REASON_PHRASES[r.code];
      if (d === '' || d === phrase || d === r.code || d === `${r.code} ${phrase}` || GENERIC.has(d)) {
        out.push(finding(`${r.code} has its standard meaning here; leave it to the default response, or describe what is specific to ${label(op)}`, r.refAt));
      }
    }
  }
  return out;
}

const isCollectionPath = (p) => {
  const segs = pathSegments(p);
  return segs.length > 0 && !isParamSegment(segs.at(-1)) && segs.at(-1) !== 'self';
};

// #220: the most specific code: 204 when there is no payload, 201 when a POST creates.
export function specificStatusCodes(doc) {
  const out = [];
  for (const op of operations(doc)) {
    const codes = Object.keys(op.op.responses ?? {});
    for (const r of responses(doc, op)) {
      if (r.code === '200' && !hasContent(r.response) && op.method !== 'head') out.push(finding(`${label(op)} 200 returns no payload; use 204`, r.refAt));
    }
    const success = codes.filter(isSuccessCode);
    const text = `${op.op.summary ?? ''} ${op.op.description ?? ''}`;
    if (op.method === 'post' && isCollectionPath(op.path) && success.length === 1 && success[0] === '200' && !/GET[ -]with[ -]body|search|quer/i.test(text) && !isBatch(op)) {
      out.push(finding(`${label(op)} returns only 200; a POST that creates returns 201 (or 202 when asynchronous)`, [...op.at, 'responses']));
    }
  }
  return out;
}

const camelWords = (s) => String(s ?? '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

const isBatch = (op) => [...pathSegments(op.path).flatMap(words), ...camelWords(op.op.operationId), ...camelWords(op.op.summary)]
  .some((w) => w === 'batch' || w === 'bulk' || w === 'batches');

// #152: batch and bulk requests answer 207 with a status per item.
export function batch207(doc) {
  const out = [];
  for (const op of operations(doc)) {
    const codes = Object.keys(op.op.responses ?? {});
    if (op.method === 'post' && isBatch(op) && !codes.includes('207')) out.push(finding(`${label(op)} is a batch or bulk request: respond 207 with a status per item`, [...op.at, 'responses']));
    for (const r of responses(doc, op)) {
      if (r.code !== '207') continue;
      const json = [...mediaTypes(r.response, r.at)].find((m) => isJsonMediaType(m.type));
      const items = json && deref(doc, objectView(doc, json.media.schema).properties.items).node;
      const item = items && deref(doc, items.items).node;
      const v = item ? objectView(doc, item) : undefined;
      if (!v || !v.required.has('id') || !v.required.has('status')) out.push(finding('A 207 response returns { items: [ { id, status, description } ] } with id and status required', r.at));
    }
  }
  return out;
}

// #153: 429 tells the client when to retry.
export function rateLimitHeaders(doc) {
  const out = [];
  for (const op of operations(doc)) {
    for (const r of responses(doc, op)) {
      if (r.code !== '429') continue;
      const names = new Set([...headers(doc, r.response, r.at)].map((h) => h.name.toLowerCase()));
      const trio = ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset'].every((h) => names.has(h));
      if (!names.has('retry-after') && !trio) out.push(finding('429 must declare Retry-After, or X-RateLimit-Limit, X-RateLimit-Remaining and X-RateLimit-Reset', r.at));
    }
  }
  return out;
}

const PROBLEM_MODEL = /^https:\/\/opensource\.zalando\.com\/restful-api-guidelines\/models\/problem-1\.0\.[01]\.yaml#\/Problem$/;
const PROBLEM_DEPRECATED = /^https:\/\/(opensource\.zalando\.com\/problem\/|zalando\.github\.io\/problem\/)/;

// #176: error responses offer application/problem+json; every operation can return one.
export function problemJson(doc) {
  const out = [];
  for (const op of operations(doc)) {
    let offered = false;
    for (const r of responses(doc, op)) {
      if (!isErrorCode(r.code) && !/^[45]XX$/i.test(r.code)) continue;
      const types = [...mediaTypes(r.response, r.at)];
      if (types.some((m) => isProblemMediaType(m.type))) offered = true;
      else if (types.length) out.push(finding(`Error response ${r.code} must offer application/problem+json`, [...r.at, 'content']));
    }
    if (!offered) out.push(finding(`${label(op)} returns no Problem JSON for errors; add a default (or 4xx/5xx) response with application/problem+json`, [...op.at, 'responses']));
  }
  return dedupe(out);
}

const PROBLEM_TYPES = { type: 'string', title: 'string', status: 'integer', detail: 'string', instance: 'string' };

function isProblemSchema(doc, schema) {
  if (isObj(schema) && typeof schema.$ref === 'string' && !schema.$ref.startsWith('#')) return { ok: PROBLEM_MODEL.test(schema.$ref) || PROBLEM_DEPRECATED.test(schema.$ref) };
  const { node } = deref(doc, schema);
  if (!isObj(node)) return { ok: true };
  if (Array.isArray(node.allOf) && node.allOf.some((s) => isObj(s) && typeof s.$ref === 'string' && (PROBLEM_MODEL.test(s.$ref) || PROBLEM_DEPRECATED.test(s.$ref)))) return { ok: true };
  const t = typesOf(node);
  if (t.size && !t.has('object')) return { ok: false, why: `a Problem is an object, not ${[...t].join('/')}` };
  const props = objectView(doc, node).properties;
  for (const [k, want] of Object.entries(PROBLEM_TYPES)) {
    if (!(k in props)) continue;
    const { node: p } = deref(doc, props[k]);
    const pt = typesOf(p);
    if (pt.size && !pt.has(want)) return { ok: false, why: `Problem field "${k}" must be ${want}` };
  }
  return { ok: true };
}

// #176: the problem+json schema is the Problem object (RFC 9457).
export function problemSchema(doc) {
  const out = [];
  for (const op of operations(doc)) {
    for (const r of responses(doc, op)) {
      for (const m of mediaTypes(r.response, r.at)) {
        if (!isProblemMediaType(m.type) || m.media.schema === undefined) continue;
        const res = isProblemSchema(doc, m.media.schema);
        if (!res.ok) out.push(finding(res.why ?? 'Reference the guideline Problem model (models/problem-1.0.1.yaml#/Problem)', [...m.at, 'schema']));
      }
    }
  }
  return dedupe(out);
}

// #176: the old Problem locations are deprecated.
export function problemReference(doc) {
  const out = [];
  const stack = [{ node: doc, at: [] }];
  const seen = new Set();
  while (stack.length) {
    const { node, at } = stack.pop();
    if (node === null || typeof node !== 'object' || seen.has(node)) continue;
    seen.add(node);
    if (typeof node.$ref === 'string' && PROBLEM_DEPRECATED.test(node.$ref)) {
      out.push(finding('Replace the deprecated Problem reference with https://opensource.zalando.com/restful-api-guidelines/models/problem-1.0.1.yaml#/Problem', [...at, '$ref']));
    }
    for (const [k, v] of Object.entries(node)) if (v && typeof v === 'object') stack.push({ node: v, at: [...at, k] });
  }
  return out;
}

// #177: no stack traces: no fields for them, none in error examples.
export function noStackTraces(doc) {
  const out = [];
  const flag = (k, at) => out.push(finding(`"${k}" exposes implementation details; never return stack traces`, at));
  for (const { schema, at } of schemas(doc)) {
    if (!isObj(schema.properties)) continue;
    for (const k of Object.keys(schema.properties)) if (STACK_FIELDS.has(k.toLowerCase())) flag(k, [...at, 'properties', k]);
  }
  for (const op of operations(doc)) {
    for (const r of responses(doc, op)) {
      if (!isErrorCode(r.code)) continue;
      for (const m of mediaTypes(r.response, r.at)) {
        const { node, path } = deref(doc, m.media.schema, [...m.at, 'schema']);
        const props = isObj(node) ? objectView(doc, node).properties : {};
        for (const k of Object.keys(props)) if (ERROR_STACK_FIELDS.has(k.toLowerCase())) flag(k, isObj(node?.properties) && k in node.properties ? [...path, 'properties', k] : path);
      }
    }
  }
  for (const op of operations(doc)) {
    for (const r of responses(doc, op)) {
      for (const m of mediaTypes(r.response, r.at)) {
        const samples = [m.media.example, ...(isObj(m.media.examples) ? Object.values(m.media.examples).map((e) => e?.value) : [])];
        if (samples.some((s) => strings(s).some(looksLikeStackTrace))) {
          out.push(finding('This example contains a stack trace; never expose one', m.at));
        }
      }
    }
  }
  return dedupe(out);
}

const strings = (v) => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : []);

// #251: no redirection codes.
export function noRedirects(doc) {
  const out = [];
  for (const op of operations(doc)) {
    for (const code of Object.keys(op.op.responses ?? {})) {
      if (REDIRECT_STATUS.has(code)) out.push(finding(`Avoid redirect ${code}: point clients to the new location, redirect behind the API, or deprecate`, [...op.at, 'responses', code]));
    }
  }
  return out;
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((f) => {
    const k = f.path.join('\u0000') + f.message;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
