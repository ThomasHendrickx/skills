import { isObj, deref, operations, parameters, responses, requestBody, mediaTypes, headers, pathSegments, isParamSegment, isJsonMediaType, objectView, typesOf, finding } from '../lib/oas.js';

const label = (op) => `${op.method.toUpperCase()} ${op.path}`;

const isCollectionPath = (p) => {
  const segs = pathSegments(p);
  return segs.length > 0 && !isParamSegment(segs.at(-1)) && segs.at(-1) !== 'self';
};

// #148: GET and HEAD carry no request body.
export function getWithoutBody(doc) {
  const out = [];
  for (const op of operations(doc)) {
    if ((op.method === 'get' || op.method === 'head') && op.op.requestBody !== undefined) {
      out.push(finding(`${label(op)} must not have a request body; use query parameters, or POST documented as GET with body`, [...op.at, 'requestBody']));
    }
  }
  return out;
}

// #148: DELETE with a body has undefined semantics; use POST documented as DELETE with body.
export function deleteWithoutBody(doc) {
  const out = [];
  for (const op of operations(doc)) {
    if (op.method === 'delete' && op.op.requestBody !== undefined) out.push(finding(`${label(op)} has a request body; use POST documented as DELETE with body`, [...op.at, 'requestBody']));
  }
  return out;
}

// #148: on POST the service creates and owns the resource identifier.
export function serverOwnedIds(doc) {
  const out = [];
  for (const op of operations(doc)) {
    if (op.method !== 'post' || !isCollectionPath(op.path)) continue;
    const body = requestBody(doc, op);
    if (!body) continue;
    for (const m of mediaTypes(body.body, body.at)) {
      if (!isJsonMediaType(m.type) || !isObj(m.media.schema)) continue;
      const id = objectView(doc, m.media.schema).properties.id;
      if (id === undefined) continue;
      const { node } = deref(doc, id);
      if (!node?.readOnly) out.push(finding(`${label(op)} lets the client pass "id"; the service creates the identifier (mark it readOnly)`, [...m.at, 'schema']));
    }
  }
  return out;
}

const PATCH_TYPES = /^application\/(merge-patch|json-patch)\+json\s*(;.*)?$/i;

// #148: PATCH with one patch format: JSON Merge Patch or JSON Patch.
export function patchMediaTypes(doc) {
  const out = [];
  for (const op of operations(doc)) {
    if (op.method !== 'patch') continue;
    const body = requestBody(doc, op);
    if (!body) continue;
    const types = [...mediaTypes(body.body, body.at)];
    const other = types.filter((m) => !PATCH_TYPES.test(m.type));
    if (other.length) out.push(finding(`${label(op)}: patch with application/merge-patch+json or application/json-patch+json, not ${other.map((m) => m.type).join(', ')}`, [...body.at, 'content']));
    else if (types.length > 1) out.push(finding(`${label(op)}: choose one patch format per endpoint`, [...body.at, 'content']));
  }
  return out;
}

const hasContent = (r) => isObj(r.content) && Object.keys(r.content).length > 0;

// #148: a 201 without the created resource in the body gives its URL in Location.
export function createdLocation(doc) {
  const out = [];
  for (const op of operations(doc)) {
    for (const r of responses(doc, op)) {
      if (r.code !== '201' || hasContent(r.response)) continue;
      const names = [...headers(doc, r.response, r.at)].map((h) => h.name.toLowerCase());
      if (!names.includes('location')) out.push(finding(`${label(op)} 201 returns no body: provide the Location header`, r.at));
    }
  }
  return out;
}

// #154: array query and header parameters state their collection format.
export function collectionFormat(doc) {
  const out = [];
  const seen = new Set();
  for (const op of operations(doc)) {
    for (const { param, at } of parameters(doc, op)) {
      if (seen.has(param) || (param.in !== 'query' && param.in !== 'header')) continue;
      seen.add(param);
      const { node: s } = deref(doc, param.schema);
      if (!typesOf(s).has('array')) continue;
      if (param.in === 'query' && (param.style !== 'form' || typeof param.explode !== 'boolean')) {
        out.push(finding(`Array query parameter "${param.name}": set style: form and explode: false (comma-separated) or true (repeated)`, at));
      }
      if (param.in === 'header' && (param.style !== 'simple' || param.explode !== false)) {
        out.push(finding(`Array header "${param.name}": set style: simple and explode: false`, at));
      }
    }
  }
  return out;
}
