import { operations, parameters, responses, headers, allParameters, finding } from '../lib/oas.js';

// #156: declare gzip support with Accept-Encoding (request) and Content-Encoding (response).
export function compressionHeaders(doc) {
  let req = false;
  let res = false;
  for (const op of operations(doc)) {
    if (parameters(doc, op).some((p) => p.param.in === 'header' && p.param.name.toLowerCase() === 'accept-encoding')) req = true;
    for (const r of responses(doc, op)) if ([...headers(doc, r.response, r.at)].some((h) => h.name.toLowerCase() === 'content-encoding')) res = true;
  }
  if (req && res) return [];
  const missing = [!req && 'the Accept-Encoding request header', !res && 'the Content-Encoding response header'].filter(Boolean).join(' and ');
  return [finding(`Signal gzip support: define ${missing}`, ['paths'])];
}

// #157: the fields filter has no default value.
export function fieldsParameter(doc) {
  const out = [];
  for (const { param, at, schema } of allParameters(doc)) {
    if (param.in === 'query' && param.name === 'fields' && schema.default !== undefined) out.push(finding('Do not give the fields parameter a default value', [...at, 'schema', 'default']));
  }
  return out;
}

// #227: cacheable GET, HEAD and POST endpoints declare Cache-Control, Vary and ETag; never Expires.
export function cacheableDocumented(doc) {
  const out = [];
  const seen = new Set();
  for (const op of operations(doc)) {
    for (const r of responses(doc, op)) {
      if (seen.has(r.response)) continue;
      seen.add(r.response);
      const names = new Map([...headers(doc, r.response, r.at)].map((h) => [h.name.toLowerCase(), h.keyAt]));
      if (names.has('expires')) out.push(finding('Do not define Expires; Cache-Control max-age sets the cache lifetime', names.get('expires')));
      if (names.has('cache-control') && ['get', 'head', 'post'].includes(op.method)) {
        const missing = ['Vary', 'ETag'].filter((h) => !names.has(h.toLowerCase()));
        if (missing.length) out.push(finding(`A cacheable response declares Cache-Control, Vary and ETag; add ${missing.join(' and ')}`, r.at));
      }
    }
  }
  return out;
}
