import { isObj, isOas31, deref, operations, parameters, responses, requestBody, mediaTypes, allParameters, schemas, typesOf, isJsonMediaType, isObjectSchema, isMapSchema, isExtensibleEnumDescription, pathSegments, finding } from '../lib/oas.js';

const CONSTRAINTS = ['format', 'enum', 'pattern', 'maxLength', 'const', 'x-extensible-enum'];
const constrained = (s) => CONSTRAINTS.some((k) => s[k] !== undefined) || (isExtensibleEnumDescription(s) && Array.isArray(s.examples));

// #109: accurate input constraints; a free string has at least a maxLength, pattern, format or enum.
export function conservativeInput(doc) {
  const out = [];
  const reported = new Set();
  const seen = new Set();
  const visit = (raw, at, depth) => {
    const { node, path } = deref(doc, raw, at);
    if (!isObj(node) || seen.has(node) || depth > 30) return;
    seen.add(node);
    if (node.readOnly === true) return;
    if (typesOf(node).has('string') && !constrained(node)) {
      const key = path.join('\u0000');
      if (!reported.has(key)) {
        reported.add(key);
        out.push(finding('Input string without constraints: add maxLength, pattern, format or enum', path));
      }
    }
    if (isObj(node.properties)) for (const [k, v] of Object.entries(node.properties)) visit(v, [...path, 'properties', k], depth + 1);
    if (isObj(node.items)) visit(node.items, [...path, 'items'], depth + 1);
    if (isObj(node.additionalProperties)) visit(node.additionalProperties, [...path, 'additionalProperties'], depth + 1);
    for (const key of ['allOf', 'anyOf', 'oneOf']) if (Array.isArray(node[key])) node[key].forEach((s, i) => visit(s, [...path, key, i], depth + 1));
  };
  for (const op of operations(doc)) {
    const body = requestBody(doc, op);
    if (body) for (const m of mediaTypes(body.body, body.at)) if (isJsonMediaType(m.type) && m.media.schema) visit(m.media.schema, [...m.at, 'schema'], 0);
    for (const { param, at } of parameters(doc, op)) if (param.schema && param.in !== 'cookie') visit(param.schema, [...at, 'schema'], 0);
  }
  return out;
}

// #111: objects stay open for extension: never additionalProperties: false.
export function openForExtension(doc) {
  const out = [];
  for (const { schema, at } of schemas(doc)) {
    for (const key of ['additionalProperties', 'unevaluatedProperties']) {
      if (schema[key] === false) out.push(finding(`Do not set ${key}: false; objects stay open for extension`, [...at, key]));
    }
  }
  return out;
}

const versionParam = (type) => type.split(';').slice(1).map((s) => s.trim()).find((p) => /^version=/i.test(p));

function* allMediaTypes(doc) {
  for (const op of operations(doc)) {
    const body = requestBody(doc, op);
    if (body) yield* mediaTypes(body.body, body.at);
    for (const r of responses(doc, op)) yield* mediaTypes(r.response, r.at);
  }
}

// #113: avoid versioning; prefer compatible changes.
export function avoidVersioning(doc) {
  const out = [];
  const seen = new Set();
  for (const m of allMediaTypes(doc)) {
    const key = m.at.join('\u0000');
    if (versionParam(m.type) && !seen.has(key)) {
      seen.add(key);
      out.push(finding(`${m.type} versions the API; prefer compatible changes or a new resource`, m.at));
    }
  }
  return out;
}

const VERSION_QUERY = new Set(['version', 'api_version', 'api-version', 'apiversion', 'v']);
const VERSION_HEADER = new Set(['api-version', 'x-api-version', 'accept-version', 'x-version', 'version']);
const VERSIONED_TYPE = /^application\/x\.[a-z0-9.-]+\+json\s*;\s*version=\d+$/i;

// #114: when versioning is unavoidable, version the media type: application/x.<name>+json;version=<n>.
export function mediaTypeVersioning(doc) {
  const out = [];
  for (const { param, at } of allParameters(doc)) {
    const n = param.name.toLowerCase();
    if ((param.in === 'query' && VERSION_QUERY.has(n)) || (param.in === 'header' && VERSION_HEADER.has(n))) {
      out.push(finding(`"${param.name}" versions the API through a ${param.in} parameter; use media type versioning`, [...at, 'name']));
    }
  }
  const seen = new Set();
  for (const m of allMediaTypes(doc)) {
    const key = m.at.join('\u0000');
    if (seen.has(key)) continue;
    seen.add(key);
    if (versionParam(m.type) && !VERSIONED_TYPE.test(m.type)) out.push(finding(`Versioned media type ${m.type} must have the form application/x.<name>+json;version=<n>`, m.at));
  }
  return out;
}

const VERSION_SEGMENT = /^(v\d+([._-]\d+)*|version-?\d+|api-v\d+)$/i;

// #115: no version in the URL.
export function noUrlVersioning(doc) {
  const out = [];
  for (const p of isObj(doc?.paths) ? Object.keys(doc.paths) : []) {
    const seg = pathSegments(p).find((s) => VERSION_SEGMENT.test(s));
    if (seg) out.push(finding(`Path ${p} carries the version "${seg}"; use media type versioning, if any`, ['paths', p]));
  }
  if (Array.isArray(doc?.servers)) {
    doc.servers.forEach((s, i) => {
      const path = typeof s?.url === 'string' ? s.url.replace(/^[a-z]+:\/\/[^/]+/i, '') : '';
      const seg = pathSegments(path).find((x) => VERSION_SEGMENT.test(x));
      if (seg) out.push(finding(`Server URL ${s.url} carries the version "${seg}"`, ['servers', i, 'url']));
    });
  }
  return out;
}

// #110: responses return a JSON object (not an array, not a map) at the top level.
export function topLevelObject(doc) {
  const out = [];
  const seen = new Set();
  for (const op of operations(doc)) {
    for (const r of responses(doc, op)) {
      for (const m of mediaTypes(r.response, r.at)) {
        if (!isJsonMediaType(m.type) || !isObj(m.media.schema)) continue;
        const key = m.at.join('\u0000');
        if (seen.has(key)) continue;
        seen.add(key);
        const { node } = deref(doc, m.media.schema);
        if (!isObj(node) || (isObj(m.media.schema) && m.media.schema.$ref && !m.media.schema.$ref.startsWith('#'))) continue;
        const branches = [...(node.oneOf ?? []), ...(node.anyOf ?? [])];
        const objectLike = isObjectSchema(doc, node) || (branches.length > 0 && branches.every((b) => isObjectSchema(doc, b)));
        if (!objectLike) out.push(finding(`Return a JSON object at the top level, not ${typesOf(node).has('array') ? 'an array' : 'a primitive value'}`, [...m.at, 'schema']));
        else if (isMapSchema(doc, node)) out.push(finding('Return a JSON object with defined properties at the top level, not a map', [...m.at, 'schema']));
      }
    }
  }
  return out;
}

// #112: open-ended values (examples with the Extensible enum prefix) over a closed enum.
export function extensibleEnums(doc) {
  const out = [];
  const v31 = isOas31(doc);
  const how = v31 ? 'examples with the description prefix "[Extensible enum](https://opensource.zalando.com/restful-api-guidelines/#112)."' : 'x-extensible-enum';
  for (const { schema, at } of schemas(doc)) {
    if (Array.isArray(schema.enum) && schema.enum.length > 1 && schema.enum.every((v) => typeof v === 'string')) {
      out.push(finding(`enum is a closed set; unless it is complete and fully yours, use ${how}`, [...at, 'enum']));
    }
    if (v31 && Array.isArray(schema['x-extensible-enum'])) out.push(finding('x-extensible-enum is historic in OpenAPI 3.1; use examples with the "[Extensible enum]" description prefix', [...at, 'x-extensible-enum']));
    if (isExtensibleEnumDescription(schema) && !Array.isArray(schema.examples)) out.push(finding('An extensible enum lists its known values in examples', at));
  }
  return out;
}
