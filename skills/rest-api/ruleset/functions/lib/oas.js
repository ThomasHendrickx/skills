// Helpers over the raw (unresolved) OpenAPI 3.x document: local $ref resolution,
// operations, parameters, responses and a walk over every schema object.
// Each schema is visited once, where it is defined, so a finding is reported once.

export const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

export const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export const isOas3 = (doc) => typeof doc?.openapi === 'string' && /^3\./.test(doc.openapi);

export const isOas31 = (doc) => typeof doc?.openapi === 'string' && /^3\.[1-9]/.test(doc.openapi);

const decodeSegment = (s) => {
  let out = s;
  try {
    out = decodeURIComponent(s);
  } catch {
    // keep the raw segment
  }
  return out.replace(/~1/g, '/').replace(/~0/g, '~');
};

export function resolvePointer(doc, ref) {
  if (typeof ref !== 'string' || !ref.startsWith('#')) return undefined;
  const parts = ref === '#' ? [] : ref.slice(1).split('/').slice(1).map(decodeSegment);
  let node = doc;
  for (const p of parts) {
    if (node === null || typeof node !== 'object' || !(p in node)) return undefined;
    node = node[p];
  }
  return { node, path: parts };
}

// Follows a chain of local $refs. External refs are returned as they are, flagged.
export function deref(doc, node, path = []) {
  const seen = new Set();
  let current = node;
  let at = path;
  while (isObj(current) && typeof current.$ref === 'string') {
    const ref = current.$ref;
    if (!ref.startsWith('#')) return { node: current, path: at, external: ref };
    if (seen.has(ref)) return { node: current, path: at, cycle: true };
    seen.add(ref);
    const target = resolvePointer(doc, ref);
    if (!target) return { node: undefined, path: at, broken: ref };
    current = target.node;
    at = target.path;
  }
  return { node: current, path: at };
}

export function* operations(doc) {
  if (!isObj(doc?.paths)) return;
  for (const [p, raw] of Object.entries(doc.paths)) {
    const { node: item } = deref(doc, raw, ['paths', p]);
    if (!isObj(item)) continue;
    for (const method of METHODS) {
      if (isObj(item[method])) {
        yield { path: p, method, op: item[method], item, at: ['paths', p, method] };
      }
    }
  }
}

// Effective parameters of an operation: path-item level, overridden by operation level.
export function parameters(doc, { item, op, path, method }) {
  const byKey = new Map();
  const add = (list, at) => {
    if (!Array.isArray(list)) return;
    list.forEach((raw, i) => {
      const { node, path: where } = deref(doc, raw, [...at, i]);
      if (!isObj(node) || typeof node.name !== 'string') return;
      const key = `${node.in}:${node.in === 'header' ? node.name.toLowerCase() : node.name}`;
      byKey.set(key, { param: node, at: where, ref: raw !== node });
    });
  };
  add(item?.parameters, ['paths', path, 'parameters']);
  add(op?.parameters, ['paths', path, method, 'parameters']);
  return [...byKey.values()];
}

export function* responses(doc, { op, at }) {
  if (!isObj(op?.responses)) return;
  for (const [code, raw] of Object.entries(op.responses)) {
    const { node, path } = deref(doc, raw, [...at, 'responses', code]);
    if (isObj(node)) yield { code: String(code), response: node, at: path, refAt: [...at, 'responses', code] };
  }
}

export function* mediaTypes(container, at) {
  if (!isObj(container?.content)) return;
  for (const [type, media] of Object.entries(container.content)) {
    if (isObj(media)) yield { type, media, at: [...at, 'content', type] };
  }
}

export function requestBody(doc, { op, at }) {
  if (op?.requestBody === undefined) return undefined;
  const { node, path } = deref(doc, op.requestBody, [...at, 'requestBody']);
  return isObj(node) ? { body: node, at: path } : undefined;
}

export function* headers(doc, response, at) {
  if (!isObj(response?.headers)) return;
  for (const [name, raw] of Object.entries(response.headers)) {
    const { node, path } = deref(doc, raw, [...at, 'headers', name]);
    yield { name, header: isObj(node) ? node : {}, at: path, keyAt: [...at, 'headers', name] };
  }
}

export const isJsonMediaType = (type) => /^application\/(?:[\w.+-]+\+)?json(?:\s*;.*)?$/i.test(type.trim());

export const isProblemMediaType = (type) => /^application\/problem\+json(?:\s*;.*)?$/i.test(type.trim());

export const isErrorCode = (code) => /^[45]/.test(code) || code === 'default';

export const isSuccessCode = (code) => /^2/.test(code);

export const pathSegments = (p) => p.split('/').filter((s) => s !== '');

export const isParamSegment = (s) => /^\{[^{}]+\}$/.test(s);

// Types a schema declares, with 'null' when OpenAPI 3.0 nullable is set.
export function typesOf(schema) {
  const out = new Set();
  if (!isObj(schema)) return out;
  const t = schema.type;
  if (Array.isArray(t)) t.forEach((x) => out.add(x));
  else if (typeof t === 'string') out.add(t);
  if (schema.nullable === true) out.add('null');
  if (schema.const === null || (Array.isArray(schema.enum) && schema.enum.includes(null))) out.add('null');
  return out;
}

// Types including the branches of a oneOf/anyOf wrapper such as anyOf: [boolean, null].
export function effectiveTypes(doc, schema, depth = 0) {
  const out = typesOf(schema);
  if (depth > 5 || !isObj(schema)) return out;
  for (const key of ['oneOf', 'anyOf']) {
    if (!Array.isArray(schema[key])) continue;
    for (const sub of schema[key]) {
      const { node } = deref(doc, sub);
      effectiveTypes(doc, node, depth + 1).forEach((x) => out.add(x));
    }
  }
  return out;
}

const SUBSCHEMA_MAPS = ['properties', 'patternProperties', 'dependentSchemas', '$defs', 'definitions'];
const SUBSCHEMA_LISTS = ['allOf', 'anyOf', 'oneOf', 'prefixItems'];
const SUBSCHEMA_SINGLE = ['not', 'if', 'then', 'else', 'contains', 'propertyNames', 'unevaluatedItems', 'unevaluatedProperties', 'additionalItems'];

function* subschemas(schema, at) {
  for (const key of SUBSCHEMA_MAPS) {
    if (!isObj(schema[key])) continue;
    for (const [name, sub] of Object.entries(schema[key])) {
      if (isObj(sub)) yield { schema: sub, at: [...at, key, name], kind: key, name };
    }
  }
  for (const key of SUBSCHEMA_LISTS) {
    if (!Array.isArray(schema[key])) continue;
    for (const [i, sub] of schema[key].entries()) {
      if (isObj(sub)) yield { schema: sub, at: [...at, key, i], kind: key };
    }
  }
  if (isObj(schema.items)) yield { schema: schema.items, at: [...at, 'items'], kind: 'items' };
  if (Array.isArray(schema.items)) {
    for (const [i, sub] of schema.items.entries()) if (isObj(sub)) yield { schema: sub, at: [...at, 'items', i], kind: 'items' };
  }
  if (isObj(schema.additionalProperties)) {
    yield { schema: schema.additionalProperties, at: [...at, 'additionalProperties'], kind: 'additionalProperties' };
  }
  for (const key of SUBSCHEMA_SINGLE) {
    if (isObj(schema[key])) yield { schema: schema[key], at: [...at, key], kind: key };
  }
}

function* mediaSchemas(container, at) {
  for (const { media, at: mAt } of mediaTypes(container, at)) {
    if (isObj(media.schema)) yield { schema: media.schema, at: [...mAt, 'schema'], root: 'media', mediaAt: mAt };
  }
}

function* parameterSchemas(list, at) {
  if (!Array.isArray(list)) return;
  for (const [i, p] of list.entries()) {
    if (!isObj(p) || p.$ref) continue;
    if (isObj(p.schema)) yield { schema: p.schema, at: [...at, i, 'schema'], root: 'parameter', param: p };
    yield* mediaSchemas(p, [...at, i]);
  }
}

function* responseSchemas(response, at) {
  if (!isObj(response) || response.$ref) return;
  yield* mediaSchemas(response, at);
  if (isObj(response.headers)) {
    for (const [name, h] of Object.entries(response.headers)) {
      if (isObj(h) && !h.$ref && isObj(h.schema)) yield { schema: h.schema, at: [...at, 'headers', name, 'schema'], root: 'header' };
    }
  }
}

function* operationSchemas(op, at) {
  yield* parameterSchemas(op.parameters, [...at, 'parameters']);
  if (isObj(op.requestBody) && !op.requestBody.$ref) yield* mediaSchemas(op.requestBody, [...at, 'requestBody']);
  if (isObj(op.responses)) {
    for (const [code, r] of Object.entries(op.responses)) yield* responseSchemas(r, [...at, 'responses', code]);
  }
}

function* pathItemSchemas(item, at) {
  if (!isObj(item) || item.$ref) return;
  yield* parameterSchemas(item.parameters, [...at, 'parameters']);
  for (const m of METHODS) if (isObj(item[m])) yield* operationSchemas(item[m], [...at, m]);
}

// Roots: every place a schema object can be defined in OpenAPI 3.x.
function* schemaRoots(doc) {
  const c = doc?.components;
  if (isObj(c?.schemas)) {
    for (const [name, s] of Object.entries(c.schemas)) if (isObj(s)) yield { schema: s, at: ['components', 'schemas', name], root: 'component', name };
  }
  if (isObj(c?.parameters)) {
    for (const [name, p] of Object.entries(c.parameters)) {
      if (!isObj(p) || p.$ref) continue;
      if (isObj(p.schema)) yield { schema: p.schema, at: ['components', 'parameters', name, 'schema'], root: 'parameter', param: p };
      yield* mediaSchemas(p, ['components', 'parameters', name]);
    }
  }
  if (isObj(c?.headers)) {
    for (const [name, h] of Object.entries(c.headers)) {
      if (isObj(h) && !h.$ref && isObj(h.schema)) yield { schema: h.schema, at: ['components', 'headers', name, 'schema'], root: 'header' };
    }
  }
  if (isObj(c?.requestBodies)) {
    for (const [name, b] of Object.entries(c.requestBodies)) if (isObj(b) && !b.$ref) yield* mediaSchemas(b, ['components', 'requestBodies', name]);
  }
  if (isObj(c?.responses)) {
    for (const [name, r] of Object.entries(c.responses)) yield* responseSchemas(r, ['components', 'responses', name]);
  }
  for (const top of ['paths', 'webhooks']) {
    if (!isObj(doc?.[top])) continue;
    for (const [p, item] of Object.entries(doc[top])) yield* pathItemSchemas(item, [top, p]);
  }
}

// Every schema object in the document, nested ones included, each once.
// Yields { schema, at, kind, name, parent, root }: kind is how it hangs off its
// parent ('properties', 'items', ...), name the property name under 'properties'.
export function* schemas(doc) {
  const seen = new Set();
  const stack = [];
  for (const r of schemaRoots(doc)) stack.push({ ...r, kind: 'root', parent: undefined });
  stack.reverse();
  while (stack.length) {
    const entry = stack.pop();
    const { schema } = entry;
    if (!isObj(schema) || seen.has(schema)) continue;
    seen.add(schema);
    if (typeof schema.$ref === 'string') continue;
    yield entry;
    const children = [...subschemas(schema, entry.at)].map((c) => ({ ...c, parent: schema, root: entry.root, param: entry.param }));
    for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
  }
}

// Every parameter object defined in the document, each once: { param, at, schema }.
export function* allParameters(doc) {
  const seen = new Set();
  const emit = function* (p, at) {
    if (!isObj(p) || p.$ref || seen.has(p) || typeof p.name !== 'string') return;
    seen.add(p);
    const { node } = deref(doc, p.schema, [...at, 'schema']);
    yield { param: p, at, schema: isObj(node) ? node : {} };
  };
  if (isObj(doc?.components?.parameters)) {
    for (const [name, p] of Object.entries(doc.components.parameters)) yield* emit(p, ['components', 'parameters', name]);
  }
  for (const top of ['paths', 'webhooks']) {
    if (!isObj(doc?.[top])) continue;
    for (const [path, item] of Object.entries(doc[top])) {
      if (!isObj(item)) continue;
      if (Array.isArray(item.parameters)) for (const [i, p] of item.parameters.entries()) yield* emit(p, [top, path, 'parameters', i]);
      for (const m of METHODS) {
        if (Array.isArray(item[m]?.parameters)) for (const [i, p] of item[m].parameters.entries()) yield* emit(p, [top, path, m, 'parameters', i]);
      }
    }
  }
}

// Property schemas: { name, schema (dereferenced), at, parent, required }.
export function* properties(doc) {
  for (const entry of schemas(doc)) {
    if (entry.kind !== 'properties') continue;
    const { node } = deref(doc, entry.schema, entry.at);
    const required = Array.isArray(entry.parent?.required) && entry.parent.required.includes(entry.name);
    yield { ...entry, raw: entry.schema, schema: isObj(node) ? node : {}, required };
  }
}

// Flattens allOf members into one view of properties and required names.
export function objectView(doc, schema, depth = 0) {
  const view = { properties: {}, required: new Set(), additionalProperties: undefined };
  const { node } = deref(doc, schema);
  if (!isObj(node) || depth > 8) return view;
  if (isObj(node.properties)) Object.assign(view.properties, node.properties);
  if (Array.isArray(node.required)) node.required.forEach((r) => view.required.add(r));
  if (node.additionalProperties !== undefined) view.additionalProperties = node.additionalProperties;
  if (Array.isArray(node.allOf)) {
    for (const sub of node.allOf) {
      const v = objectView(doc, sub, depth + 1);
      Object.assign(view.properties, v.properties);
      v.required.forEach((r) => view.required.add(r));
      if (view.additionalProperties === undefined) view.additionalProperties = v.additionalProperties;
    }
  }
  return view;
}

// True when the schema (after $ref and allOf) describes an object.
export function isObjectSchema(doc, schema) {
  const { node } = deref(doc, schema);
  if (!isObj(node)) return false;
  const t = typesOf(node);
  if (t.has('object')) return true;
  if (t.size > 0) return false;
  if (isObj(node.properties)) return true;
  return Array.isArray(node.allOf) && node.allOf.some((s) => isObjectSchema(doc, s));
}

// A map: an object with additionalProperties as a schema and no properties of its own.
export function isMapSchema(doc, schema) {
  const { node } = deref(doc, schema);
  if (!isObj(node)) return false;
  const v = objectView(doc, node);
  const extra = v.additionalProperties;
  return (extra === true || isObj(extra)) && Object.keys(v.properties).length === 0;
}

// Values a schema lists: enum, x-extensible-enum, and (OpenAPI 3.1) examples.
export const enumValues = (schema) => [
  ...(Array.isArray(schema?.enum) ? schema.enum : []),
  ...(Array.isArray(schema?.['x-extensible-enum']) ? schema['x-extensible-enum'] : []),
];

export const isExtensibleEnumDescription = (s) => typeof s?.description === 'string' && /^\s*\[?Extensible enum\]?/i.test(s.description);

// Example values given on a schema: example, examples (array, OpenAPI 3.1), default.
export function exampleValues(schema) {
  const out = [];
  if (!isObj(schema)) return out;
  if (schema.example !== undefined) out.push(schema.example);
  if (Array.isArray(schema.examples)) out.push(...schema.examples);
  return out;
}

// Splits a snake_case or kebab-case name into lower-case words.
export const words = (name) => String(name).replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[_\-\s.]+/).filter(Boolean).map((w) => w.toLowerCase());

export const finding = (message, path) => ({ message, path });
