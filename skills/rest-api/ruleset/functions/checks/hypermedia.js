import { isObj, deref, operations, responses, mediaTypes, headers, schemas, properties, typesOf, exampleValues, isJsonMediaType, isObjectSchema, words, finding } from '../lib/oas.js';

const PAGE_LINKS = new Set(['self', 'first', 'prev', 'next', 'last']);

// #164: links are hypertext controls { href }; href is reserved for them.
export function hypertextControls(doc) {
  const out = [];
  for (const { name, schema, at } of properties(doc)) {
    if (name === 'href') {
      if (!typesOf(schema).has('string')) out.push(finding('"href" is reserved for the URI of a hypertext control: type string', at));
      else if (!schema.format) out.push(finding('Give "href" format uri', at));
    } else if (!PAGE_LINKS.has(name) && (name === 'link' || words(name).at(-1) === 'link') && typesOf(schema).has('string')) {
      out.push(finding(`"${name}" is a link: model it as a hypertext control object { href }, named after the relation`, at));
    }
  }
  return out;
}

const hasItemsArray = (doc, schema) => isObj(schema.properties) && Object.values(schema.properties).some((p) => typesOf(deref(doc, p).node).has('array'));

// #165: pagination and self links are plain URI strings.
export function simplePaginationLinks(doc) {
  const out = [];
  for (const { schema, at } of schemas(doc)) {
    if (!isObj(schema.properties) || !hasItemsArray(doc, schema)) continue;
    for (const [k, v] of Object.entries(schema.properties)) {
      if (PAGE_LINKS.has(k) && isObjectSchema(doc, v)) out.push(finding(`"${k}" should be a plain URI string, not an object`, [...at, 'properties', k]));
    }
  }
  return out;
}

const ABSOLUTE = new Set(['uri', 'iri']);

// #217: links use full, absolute URIs.
export function absoluteUris(doc) {
  const out = [];
  for (const { name, schema, at } of properties(doc)) {
    const isLink = name === 'href' || (PAGE_LINKS.has(name) && typesOf(schema).has('string') && /uri|iri/.test(schema.format ?? ''));
    if (!isLink) continue;
    if (schema.format && !ABSOLUTE.has(schema.format)) out.push(finding(`"${name}" must be an absolute URI: format uri, not ${schema.format}`, at));
    for (const v of exampleValues(schema)) if (typeof v === 'string' && !/^https?:\/\//.test(v)) out.push(finding(`Example "${v}" of "${name}" is not an absolute http(s) URI`, at));
  }
  return out;
}

// #166: no Link header with JSON entities.
export function noLinkHeader(doc) {
  const out = [];
  for (const op of operations(doc)) {
    for (const r of responses(doc, op)) {
      if (![...mediaTypes(r.response, r.at)].some((m) => isJsonMediaType(m.type))) continue;
      for (const h of headers(doc, r.response, r.at)) if (h.name.toLowerCase() === 'link') out.push(finding('Embed links in the JSON payload instead of a Link header', h.keyAt));
    }
  }
  return out;
}
