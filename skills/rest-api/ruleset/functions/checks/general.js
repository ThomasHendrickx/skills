import { isObj, isOas3, operations, parameters, pathSegments, isParamSegment, properties, schemas, enumValues, words, finding } from '../lib/oas.js';
import { BRITISH, STOPWORDS } from '../lib/words.js';

// #101: the ruleset reads OpenAPI 3.x; anything else would pass silently.
export function openapi3(doc) {
  if (isOas3(doc)) return [];
  if (doc?.swagger) return [finding('OpenAPI 2.0 (Swagger) is not checked by this ruleset; convert the spec to OpenAPI 3.1', ['swagger'])];
  return [finding('Not an OpenAPI 3.x document: the `openapi` field is missing', [])];
}

// #101: one self-contained YAML file.
export function yamlFile(doc, opts, ctx) {
  const source = ctx?.document?.source;
  if (typeof source !== 'string' || /\.ya?ml$/i.test(source)) return [];
  return [finding(`The specification file must be YAML (.yaml), not ${source.split('.').pop()}`, [])];
}

const ALLOWED_REMOTE = [
  /^https:\/\/opensource\.zalando\.com\/restful-api-guidelines\/models\/[\w.-]+\.yaml(#.*)?$/,
  /^https:\/\/opensource\.zalando\.com\/problem\//,
  /^https:\/\/zalando\.github\.io\/problem\//,
  /^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[0-9a-f]{40}\//,
  /^https:\/\/github\.com\/[^/]+\/[^/]+\/(?:raw|blob)\/[0-9a-f]{40}\//,
];

// #234 and #101: only local references, or remote ones that cannot change.
export function durableReferences(doc) {
  const out = [];
  const stack = [{ node: doc, at: [] }];
  const seen = new Set();
  while (stack.length) {
    const { node, at } = stack.pop();
    if (node === null || typeof node !== 'object' || seen.has(node)) continue;
    seen.add(node);
    if (typeof node.$ref === 'string' && !node.$ref.startsWith('#') && !ALLOWED_REMOTE.some((r) => r.test(node.$ref))) {
      const kind = /^https?:/i.test(node.$ref) ? 'remote reference that may change' : 'reference to another file';
      out.push(finding(`${kind}: ${node.$ref}. Inline it, or reference a guideline model or a commit-pinned URL`, [...at, '$ref']));
    }
    for (const [k, v] of Object.entries(node)) if (v && typeof v === 'object') stack.push({ node: v, at: [...at, k] });
  }
  return out;
}

// #102: point to the API user manual.
export function userManual(doc) {
  if (typeof doc?.externalDocs?.url === 'string' && doc.externalDocs.url.trim()) return [];
  return [finding('Link the API user manual in `externalDocs.url`', doc?.externalDocs ? ['externalDocs'] : [])];
}

const SKIP_KEYS = new Set(['example', 'examples', 'default', 'enum', 'const', 'x-extensible-enum']);

function* texts(doc) {
  const stack = [{ node: doc, at: [] }];
  const seen = new Set();
  while (stack.length) {
    const { node, at } = stack.pop();
    if (node === null || typeof node !== 'object' || seen.has(node)) continue;
    seen.add(node);
    for (const [k, v] of Object.entries(node)) {
      if (SKIP_KEYS.has(k) || k.startsWith('x-')) continue;
      if (typeof v === 'string' && (k === 'description' || k === 'summary' || k === 'title') && !Array.isArray(node)) {
        yield { text: v, at: [...at, k] };
      } else if (v && typeof v === 'object') stack.push({ node: v, at: [...at, k] });
    }
  }
}

const strip = (t) => t.replace(/`[^`]*`/g, ' ').replace(/\bhttps?:\/\/\S+/g, ' ').replace(/\[[^\]]*\]\([^)]*\)/g, ' ');

const tokens = (t) => strip(t).toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);

const splitIdentifier = (s) => String(s).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').split(/[^A-Za-z]+/).filter(Boolean).map((w) => w.toLowerCase());

function britishIn(list, at, what) {
  const out = [];
  for (const w of new Set(list)) {
    if (BRITISH.has(w)) out.push(finding(`"${w}" in ${what} is British English; write "${BRITISH.get(w)}"`, at));
  }
  return out;
}

// #103: U.S. English. Flags British spellings in texts and names, and texts in German, French, Dutch or Spanish.
export function usEnglish(doc) {
  const out = [];
  for (const { text, at } of texts(doc)) {
    const ts = tokens(text);
    out.push(...britishIn(ts, at, 'the text'));
    if (ts.length < 6) continue;
    for (const [language, stop] of Object.entries(STOPWORDS)) {
      const hits = ts.filter((t) => stop.has(t));
      if (new Set(hits).size >= 3 && hits.length / ts.length >= 0.2) {
        out.push(finding(`This text reads as ${language}; write the API in U.S. English`, at));
        break;
      }
    }
  }
  for (const { name, at } of properties(doc)) out.push(...britishIn(words(name), at, `property name "${name}"`));
  for (const op of operations(doc)) {
    for (const seg of pathSegments(op.path)) {
      if (!isParamSegment(seg)) out.push(...britishIn(words(seg), ['paths', op.path], `path segment "${seg}"`));
    }
    if (typeof op.op.operationId === 'string') out.push(...britishIn(splitIdentifier(op.op.operationId), [...op.at, 'operationId'], 'the operationId'));
    for (const { param, at } of parameters(doc, op)) out.push(...britishIn(words(param.name), [...at, 'name'], `parameter "${param.name}"`));
  }
  if (isObj(doc?.components?.schemas)) {
    for (const name of Object.keys(doc.components.schemas)) out.push(...britishIn(splitIdentifier(name), ['components', 'schemas', name], `schema name "${name}"`));
  }
  for (const { schema, at } of schemas(doc)) {
    for (const v of enumValues(schema)) if (typeof v === 'string') out.push(...britishIn(splitIdentifier(v), at, `enum value "${v}"`));
  }
  return dedupe(out);
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((f) => {
    const key = `${f.path.join('\u0000')}|${f.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
