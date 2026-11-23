import { isObj, operations, parameters, pathSegments, isParamSegment, deref, exampleValues, words, finding } from '../lib/oas.js';
import { VERBS, GENERIC_RESOURCES, QUERY_SYNONYMS } from '../lib/words.js';
import pluralize from '../lib/pluralize.js';

const pathKeys = (doc) => (isObj(doc?.paths) ? Object.keys(doc.paths) : []);

const normalize = (p) => `/${pathSegments(p).map((s) => (isParamSegment(s) ? '{}' : s)).join('/')}`;

const staticSegments = (p) => pathSegments(p).filter((s) => !isParamSegment(s));

// #135: no /api base path; the base path belongs in the server object.
export function noApiBasePath(doc) {
  const out = [];
  for (const p of pathKeys(doc)) if (pathSegments(p)[0] === 'api') out.push(finding(`Path ${p} starts with /api; leave the base path to the server URL`, ['paths', p]));
  if (Array.isArray(doc?.servers)) {
    doc.servers.forEach((s, i) => {
      if (typeof s?.url === 'string' && /\/api\/?$/.test(s.url.replace(/^[a-z]+:\/\/[^/]+/i, ''))) out.push(finding(`Server URL ${s.url} uses /api as base path`, ['servers', i, 'url']));
    });
  }
  return out;
}

// #134: resource names are plural (self is the one pseudo identifier).
export function pluralResources(doc) {
  const out = [];
  for (const p of pathKeys(doc)) {
    for (const seg of staticSegments(p)) {
      if (seg === 'self' || /^v\d/.test(seg)) continue;
      const last = words(seg).at(-1);
      if (last && /[a-z]/.test(last) && !pluralize.isPlural(last)) out.push(finding(`Resource "${seg}" in ${p} should be plural ("${seg.replace(new RegExp(`${last}$`), pluralize.plural(last))}")`, ['paths', p]));
    }
  }
  return out;
}

// #228: path parameters are non-empty and URL-friendly: [a-zA-Z0-9:._\-/].
export function urlFriendlyIds(doc) {
  const out = [];
  const seen = new Set();
  for (const op of operations(doc)) {
    for (const { param, at } of parameters(doc, op)) {
      if (param.in !== 'path' || seen.has(param)) continue;
      seen.add(param);
      const { node: s } = deref(doc, param.schema);
      if (!isObj(s)) continue;
      if (s.minLength === 0) out.push(finding(`Path parameter "${param.name}" must not allow an empty value`, [...at, 'schema']));
      if (typeof s.pattern === 'string') {
        try {
          if (new RegExp(s.pattern).test('')) out.push(finding(`Pattern of path parameter "${param.name}" allows an empty value`, [...at, 'schema']));
        } catch {
          // an invalid pattern is reported by the OpenAPI schema check
        }
      }
      const values = [...exampleValues(s), ...exampleValues(param), ...(Array.isArray(s.enum) ? s.enum : [])];
      if (isObj(param.examples)) for (const e of Object.values(param.examples)) if (isObj(e) && 'value' in e) values.push(e.value);
      for (const v of values) {
        if (typeof v === 'string' && !/^[a-zA-Z0-9:._\-/]+$/.test(v)) out.push(finding(`Value "${v}" of path parameter "${param.name}" is not URL-friendly ([a-zA-Z0-9:._-/])`, at));
      }
    }
  }
  return out;
}

// #129: kebab-case path segments.
export function kebabCaseSegments(doc) {
  const out = [];
  for (const p of pathKeys(doc)) {
    for (const seg of staticSegments(p)) {
      if (!/^[a-z][a-z\-0-9]*$/.test(seg) && !/\{/.test(seg)) out.push(finding(`Path segment "${seg}" must be kebab-case (^[a-z][a-z-0-9]*$)`, ['paths', p]));
    }
  }
  return out;
}

// #136: no empty segments, no trailing slash.
export function normalizedPaths(doc) {
  const out = [];
  for (const p of pathKeys(doc)) {
    if (p.includes('//')) out.push(finding(`Path ${p} has an empty segment`, ['paths', p]));
    if (p.length > 1 && p.endsWith('/')) out.push(finding(`Path ${p} has a trailing slash`, ['paths', p]));
  }
  return out;
}

// #141: no verbs in URLs; the action is the HTTP method on a resource. A verb is flagged at the end of a
// segment (/orders/{id}/cancel, /products/search) or before a singular object (cancel-order); before a plural
// it usually names a resource (export-jobs, pull-requests).
export function verbFreeUrls(doc) {
  const out = [];
  for (const p of pathKeys(doc)) {
    for (const seg of staticSegments(p)) {
      const ws = words(seg);
      const last = ws.at(-1);
      const verb = VERBS.has(last) ? last : ws.length === 2 && VERBS.has(ws[0]) && !pluralize.isPlural(ws[1]) ? ws[0] : undefined;
      if (verb) out.push(finding(`"${seg}" in ${p} contains the verb "${verb}"; model the action as a resource (a noun) the HTTP method acts on`, ['paths', p]));
    }
  }
  return out;
}

// #142: domain-specific resource names; "items" and the like are too general at the top.
export function domainSpecificNames(doc) {
  const out = [];
  for (const p of pathKeys(doc)) {
    const first = pathSegments(p)[0];
    if (first && GENERIC_RESOURCES.has(first)) out.push(finding(`Top-level resource "${first}" is too general; name the domain object (e.g. "sales-order-items")`, ['paths', p]));
  }
  return out;
}

// #143: paths start with a resource and parameters fill whole segments.
export function resourcePathSegments(doc) {
  const out = [];
  for (const p of pathKeys(doc)) {
    const segs = pathSegments(p);
    if (segs.length && isParamSegment(segs[0])) out.push(finding(`Path ${p} must start with a resource name, not a parameter`, ['paths', p]));
    for (const seg of segs) {
      if (seg.includes('{') && !isParamSegment(seg)) out.push(finding(`Segment "${seg}" mixes a parameter with other text; give the parameter its own segment`, ['paths', p]));
    }
  }
  return out;
}

// #143: each sub-path of a resource path is itself a resource.
export function subPaths(doc) {
  const keys = pathKeys(doc);
  const defined = new Set(keys.map(normalize));
  const out = [];
  const reported = new Set();
  for (const p of keys) {
    const segs = pathSegments(p);
    for (let n = 1; n < segs.length; n += 1) {
      const prefix = `/${segs.slice(0, n).join('/')}`;
      const norm = normalize(prefix);
      if (defined.has(norm) || reported.has(norm)) continue;
      reported.add(norm);
      out.push(finding(`${p} is defined but its sub-path ${prefix} is not; each sub-path should be a valid resource`, ['paths', p]));
    }
  }
  return out;
}

// #146: resource types as the guideline counts them: a collection, its members and their
// one-to-one sub-resources.
const isParam = (s) => /^\{[^{}]*\}$/.test(s);

export function resourceType(p, defined) {
  let segs = pathSegments(normalize(p));
  for (;;) {
    if (segs.length && isParam(segs.at(-1))) segs = segs.slice(0, -1);
    if (segs.length >= 2 && isParam(segs.at(-2)) && !defined.has(`/${[...segs, '{}'].join('/')}`)) {
      segs = segs.slice(0, -2);
      continue;
    }
    return `/${segs.join('/')}`;
  }
}

export function resourceTypeLimit(doc, opts) {
  const keys = pathKeys(doc);
  const defined = new Set(keys.map(normalize));
  const types = new Set(keys.map((p) => resourceType(p, defined)));
  const max = opts?.max ?? 8;
  if (types.size <= max) return [];
  return [finding(`The API has ${types.size} resource types (${[...types].join(', ')}); keep it to ${max} or split the API`, ['paths'])];
}

// #147: at most 3 sub-resource levels.
export function subResourceLevels(doc, opts) {
  const max = opts?.max ?? 3;
  return pathKeys(doc)
    .filter((p) => staticSegments(p).length - 1 > max)
    .map((p) => finding(`${p} nests ${staticSegments(p).length - 1} sub-resource levels; use at most ${max}`, ['paths', p]));
}

const allQueryParams = function* (doc) {
  const seen = new Set();
  for (const op of operations(doc)) {
    for (const entry of parameters(doc, op)) {
      if (entry.param.in !== 'query' || seen.has(entry.param)) continue;
      seen.add(entry.param);
      yield entry;
    }
  }
};

// #130: snake_case query parameters.
export function snakeCaseQuery(doc) {
  const out = [];
  for (const { param, at } of allQueryParams(doc)) {
    if (!/^[a-z_][a-z_0-9]*$/.test(param.name)) out.push(finding(`Query parameter "${param.name}" must be snake_case`, [...at, 'name']));
  }
  return out;
}

// #137: q, sort, fields, embed, offset, cursor and limit.
export function conventionalQuery(doc) {
  const out = [];
  for (const { param, at } of allQueryParams(doc)) {
    const key = param.name.toLowerCase();
    if (QUERY_SYNONYMS.has(key)) out.push(finding(`Query parameter "${param.name}": use the conventional name ${QUERY_SYNONYMS.get(key)}`, [...at, 'name']));
  }
  return out;
}
