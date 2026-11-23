import { isObj, deref, operations, parameters, responses, allParameters, finding } from '../lib/oas.js';
import { STANDARD_HEADERS, SPECIFIED_PROPRIETARY_HEADERS, HEADER_CASE_EXCEPTIONS } from '../lib/words.js';

// Every header name the API uses: header parameters and response headers.
export function* headerUses(doc) {
  for (const { param, at } of allParameters(doc)) {
    if (param.in === 'header') yield { name: param.name, at: [...at, 'name'], where: 'request', param };
  }
  const seen = new Set();
  const fromResponse = function* (response, at) {
    if (!isObj(response) || seen.has(response) || !isObj(response.headers)) return;
    seen.add(response);
    for (const name of Object.keys(response.headers)) yield { name, at: [...at, 'headers', name], where: 'response', response };
  };
  if (isObj(doc?.components?.responses)) {
    for (const [n, r] of Object.entries(doc.components.responses)) yield* fromResponse(r, ['components', 'responses', n]);
  }
  for (const op of operations(doc)) for (const r of responses(doc, op)) yield* fromResponse(r.response, r.at);
}

const WORD = /^([A-Z][a-z0-9]*|[A-Z0-9]+)$/;

// #132: kebab-case with upper-case words (If-Modified-Since, Content-ID).
export function headerCase(doc) {
  const out = [];
  for (const { name, at } of headerUses(doc)) {
    if (HEADER_CASE_EXCEPTIONS.has(name)) continue;
    if (!name.split('-').every((w) => WORD.test(w))) out.push(finding(`Header "${name}" should be kebab-case with upper-case words (e.g. ${name.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('-')})`, at));
  }
  return out;
}

// #178: Content-* headers used correctly; the media type lives in content, not a header.
export function contentHeaders(doc) {
  const out = [];
  for (const { name, at, where } of headerUses(doc)) {
    if (name.toLowerCase() === 'content-type') {
      out.push(finding(where === 'request' ? 'Do not define Content-Type as a parameter; describe the media type in requestBody.content' : 'Do not define a Content-Type response header; describe the media type in content', at));
    }
  }
  return out;
}

// #180: Location rather than Content-Location.
export function locationHeader(doc) {
  return [...headerUses(doc)].filter((h) => h.where === 'response' && h.name.toLowerCase() === 'content-location')
    .map((h) => finding('Use the Location header instead of Content-Location', h.at));
}

// #183: no proprietary headers beyond the ones the guideline specifies.
export function proprietaryHeaders(doc) {
  const out = [];
  for (const { name, at } of headerUses(doc)) {
    const k = name.toLowerCase();
    if (!STANDARD_HEADERS.has(k) && !SPECIFIED_PROPRIETARY_HEADERS.has(k)) out.push(finding(`"${name}" is a proprietary header; express it in the path, query or body, or use a standard header`, at));
  }
  return out;
}

const FLOW_IDS = ['GKY7oDhpSiKY_gAAAABZ_A', '105a76d8-db49-4144-ace7-e683e8f4ba46', 'JAh6xH4OQhCJ9PutIV/RYw==', `${'aZ09/+_-='.repeat(14)}ab`];

// #233: every endpoint accepts X-Flow-ID (UUID, base64, base64url or [a-zA-Z0-9/+_-=]{1,128}).
export function flowId(doc) {
  const out = [];
  for (const op of operations(doc)) {
    const entry = parameters(doc, op).find((p) => p.param.in === 'header' && p.param.name.toLowerCase() === 'x-flow-id');
    if (!entry) {
      out.push(finding(`${op.method.toUpperCase()} ${op.path} must accept the X-Flow-ID header`, [...op.at, 'parameters']));
      continue;
    }
    const { node: s } = deref(doc, entry.param.schema);
    if (!isObj(s)) continue;
    if (s.type !== undefined && s.type !== 'string') out.push(finding('X-Flow-ID is a string', entry.at));
    if (typeof s.maxLength === 'number' && s.maxLength < 128) out.push(finding('X-Flow-ID must accept up to 128 characters', entry.at));
    if (typeof s.pattern === 'string') {
      let re;
      try {
        re = new RegExp(s.pattern);
      } catch {
        continue;
      }
      if (!FLOW_IDS.every((v) => re.test(v))) out.push(finding('The X-Flow-ID pattern rejects allowed values (UUID, base64, base64url, [a-zA-Z0-9/+_-=]{1,128})', entry.at));
    }
  }
  return dedupe(out);
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
