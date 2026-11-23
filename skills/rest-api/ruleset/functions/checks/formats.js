import { isObj, deref, schemas, properties, allParameters, typesOf, exampleValues, words, operations, parameters, finding } from '../lib/oas.js';
import { STRING_FORMATS, FORMAT_ALIASES, DATE_TIME_FORMATS, INTEGER_FORMATS, NUMBER_FORMATS } from '../lib/words.js';
import pluralize from '../lib/pluralize.js';

const SCALAR = new Set(['string', 'integer', 'number', 'null']);
const isScalar = (s) => {
  const t = typesOf(s);
  return [...t].every((x) => SCALAR.has(x)) && !isObj(s.properties) && !s.items;
};

// Named scalars: properties and parameters, with the items of arrays under the singular name.
function* namedScalars(doc) {
  const visit = function* (name, schema, at, extra) {
    if (!isObj(schema)) return;
    if (typesOf(schema).has('array') && isObj(schema.items)) {
      const { node, path } = deref(doc, schema.items, [...at, 'items']);
      if (isObj(node) && isScalar(node)) yield { name: pluralize.singular(String(name)), schema: node, at: path, ...extra };
      return;
    }
    if (isScalar(schema)) yield { name, schema, at, ...extra };
  };
  for (const p of properties(doc)) yield* visit(p.name, p.schema, p.at, { header: p.root === 'header' || p.param?.in === 'header' });
  for (const { param, at, schema } of allParameters(doc)) {
    yield* visit(param.name, schema, [...at, 'schema'], { header: param.in === 'header', param });
  }
}

const IGNORED_AFTER = new Set(['format', 'formats', 'type', 'types', 'unit', 'units', 'pattern', 'field', 'kind', 'mode', 'precision', 'granularity', 'zone', 'zones', 'offset', 'name', 'names', 'id', 'ids', 'count', 'counts', 'label', 'description', 'title', 'text', 'symbol', 'source', 'sources', 'filter', 'filters', 'sort']);

// What a name says the value is: 'instant' (_at), 'date', 'time', 'timestamp', 'duration', 'interval',
// 'country', 'currency', 'language', 'locale', 'email', 'uri', 'hostname', 'ip'.
export function nameKind(name) {
  const t = words(name);
  if (t.length === 0) return undefined;
  const last = t[t.length - 1];
  const has = (w) => {
    const i = t.indexOf(w);
    return i !== -1 && !IGNORED_AFTER.has(t[i + 1]);
  };
  if (last === 'at' && t.length > 1) return 'instant';
  if (has('duration')) return 'duration';
  if (last === 'interval') return 'interval';
  if (has('timestamp') || has('datetime')) return 'timestamp';
  if (has('date')) return 'date';
  if (last === 'time' && t.length > 1) return 'time';
  if (has('country')) return 'country';
  if (has('currency')) return 'currency';
  if (has('language')) return 'language';
  if (has('locale')) return 'locale';
  if (last === 'email' || last === 'mail') return 'email';
  if (last === 'url' || last === 'uri') return 'uri';
  if (last === 'hostname') return 'hostname';
  if (last === 'ip' || (t.includes('ip') && last === 'address')) return 'ip';
  return undefined;
}

// #171: number and integer carry a precision.
export function numberFormats(doc) {
  const out = [];
  for (const { schema, at } of schemas(doc)) {
    const t = typesOf(schema);
    if (t.has('integer') && !t.has('number') && !INTEGER_FORMATS.has(schema.format)) {
      out.push(finding(`integer needs format int32, int64 or bigint${schema.format ? `, not ${schema.format}` : ''}`, at));
    } else if (t.has('number') && !t.has('integer') && !NUMBER_FORMATS.has(schema.format)) {
      out.push(finding(`number needs format float, double or decimal${schema.format ? `, not ${schema.format}` : ''}`, at));
    }
  }
  return out;
}

const EXPECTED_FORMAT = { email: ['email', 'idn-email'], uri: ['uri', 'uri-reference', 'iri', 'iri-reference', 'uri-template'], hostname: ['hostname', 'idn-hostname'], ip: ['ipv4', 'ipv6'] };
const KIND_LABEL = { email: 'an email address', uri: 'a URI', hostname: 'a hostname', ip: 'an IP address' };

// #238: standard formats under their standard names, where one applies.
export function standardFormats(doc) {
  const out = [];
  for (const { schema, at } of schemas(doc)) {
    if (typeof schema.format === 'string' && FORMAT_ALIASES.has(schema.format)) {
      out.push(finding(`format "${schema.format}" is not standard; use ${FORMAT_ALIASES.get(schema.format)}`, [...at, 'format']));
    }
  }
  for (const { name, schema, at } of namedScalars(doc)) {
    const kind = nameKind(name);
    const expected = EXPECTED_FORMAT[kind];
    if (!expected || !typesOf(schema).has('string') || expected.includes(schema.format) || FORMAT_ALIASES.has(schema.format)) continue;
    out.push(finding(`"${name}" holds ${KIND_LABEL[kind]}; give it format ${expected.join(' or ')}`, at));
  }
  return out;
}

// #238: formats outside the guideline's list need a look: is a standard one applicable?
export function knownFormats(doc) {
  const out = [];
  for (const { schema, at } of schemas(doc)) {
    const f = schema.format;
    if (typeof f !== 'string' || STRING_FORMATS.has(f) || INTEGER_FORMATS.has(f) || NUMBER_FORMATS.has(f) || FORMAT_ALIASES.has(f)) continue;
    out.push(finding(`format "${f}" is not in the guideline's list of standard formats; use a standard one if it applies`, [...at, 'format']));
  }
  return out;
}

// #239: binary data as base64url (format byte or binary).
export function base64url(doc) {
  const out = [];
  for (const { schema, at } of schemas(doc)) {
    if (typeof schema.contentEncoding === 'string' && schema.contentEncoding.toLowerCase() !== 'base64url') {
      out.push(finding(`Encode binary data as base64url, not ${schema.contentEncoding}`, [...at, 'contentEncoding']));
    }
  }
  for (const { name, schema, at } of namedScalars(doc)) {
    if (/(^|_)base64$/.test(String(name)) && !['byte', 'binary'].includes(schema.format)) out.push(finding(`"${name}" holds binary data: use type string with format binary (base64url)`, at));
  }
  return out;
}

const DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const TIME_RE = /^\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// #169: date and time properties are strings with a date/time format; values use upper-case T and Z.
export function dateTimeFormats(doc) {
  const out = [];
  for (const { name, schema, at, header } of namedScalars(doc)) {
    if (header) continue;
    const kind = nameKind(name);
    if (!['instant', 'timestamp', 'date', 'time'].includes(kind)) continue;
    const t = typesOf(schema);
    if (t.has('integer') || t.has('number')) out.push(finding(`"${name}" is a date/time: use type string with a date/time format such as date-time (not a numeric timestamp)`, at));
    else if (!DATE_TIME_FORMATS.has(schema.format)) out.push(finding(`"${name}" is a date/time: give it format date-time, date, time, time-local, date-time-local, duration or period${schema.format ? `, not ${schema.format}` : ''}`, at));
  }
  for (const { schema, at, root, param } of schemas(doc)) {
    if (root === 'header' || param?.in === 'header') continue;
    const re = schema.format === 'date-time' ? DATE_TIME_RE : schema.format === 'time' ? TIME_RE : schema.format === 'date' ? DATE_RE : undefined;
    if (!re) continue;
    const values = [...exampleValues(schema), ...(schema.default !== undefined ? [schema.default] : [])];
    for (const v of values) {
      if (typeof v !== 'string') continue;
      if (/[tz]/.test(v) && re.test(v.toUpperCase())) out.push(finding(`"${v}" must use upper-case T and Z`, at));
      else if (!re.test(v)) out.push(finding(`"${v}" is not a valid ${schema.format} value`, at));
    }
  }
  return out;
}

// #255: date for days, date-time for points in time, date-time-local with a tz-id field.
export function appropriateDateTime(doc) {
  const out = [];
  for (const { schema, at } of schemas(doc)) {
    if (!isObj(schema.properties)) continue;
    const props = Object.entries(schema.properties).map(([k, v]) => [k, deref(doc, v).node]);
    const hasTz = props.some(([, v]) => v?.format === 'tz-id');
    for (const [k, v] of props) {
      if (v?.format === 'date-time-local' && !hasTz) out.push(finding(`"${k}" is a local date-time: add a time-zone property with format tz-id`, [...at, 'properties', k]));
    }
  }
  for (const { name, schema, at } of namedScalars(doc)) {
    const kind = nameKind(name);
    if (kind === 'date' && schema.format === 'date-time') out.push(finding(`"${name}" names a date: use format date, or rename it`, at));
    if (kind === 'instant' && schema.format === 'date') out.push(finding(`"${name}" (_at) names a point in time: use format date-time, or rename it`, at));
  }
  return out;
}

// #127: durations and intervals as ISO 8601 strings; <time>_between over _before/_after pairs.
export function durations(doc) {
  const out = [];
  for (const { name, schema, at } of namedScalars(doc)) {
    const kind = nameKind(name);
    if (kind === 'duration' && schema.format !== 'duration') out.push(finding(`"${name}" is a duration: use type string with format duration (ISO 8601)`, at));
    if (kind === 'interval' && schema.format !== 'period') out.push(finding(`"${name}" is a time interval: use type string with format period (ISO 8601)`, at));
  }
  for (const op of operations(doc)) {
    const names = new Map(parameters(doc, op).filter((p) => p.param.in === 'query').map((p) => [p.param.name, p.at]));
    for (const [n, at] of names) {
      const m = /^(.+)_before$/.exec(n);
      if (m && names.has(`${m[1]}_after`)) out.push(finding(`Use one ${m[1]}_between parameter (a period) instead of ${m[1]}_before and ${m[1]}_after`, at));
    }
  }
  return out;
}

const CODE_FORMATS = { country: ['iso-3166-alpha-2'], currency: ['iso-4217'], language: ['iso-639-1', 'bcp47'], locale: ['bcp47'] };

const LANGUAGE_TAG = /^[a-zA-Z]{2,3}([-_][a-zA-Z0-9]{2,8})*$/;

// A "language" whose values or description show it is not a human language code (Ruby, TypeScript).
const otherLanguage = (schema) => /programming|computer|coding|script/i.test(schema.description ?? '')
  || [...exampleValues(schema), ...(Array.isArray(schema.enum) ? schema.enum : [])].some((v) => typeof v === 'string' && !LANGUAGE_TAG.test(v));

// #170: country, language and currency codes in their ISO formats.
export function codeFormats(doc) {
  const out = [];
  for (const { name, schema, at } of namedScalars(doc)) {
    const kind = nameKind(name);
    const expected = CODE_FORMATS[kind];
    if (!expected || !typesOf(schema).has('string') || expected.includes(schema.format)) continue;
    if ((kind === 'language' || kind === 'locale') && otherLanguage(schema)) continue;
    if (expected.some((e) => FORMAT_ALIASES.get(schema.format) === e)) continue;
    out.push(finding(`"${name}" needs format ${expected.join(' or ')}`, at));
  }
  return out;
}

// #144: identifiers stay opaque strings; a UUID used as id carries no format.
export function uuidIdentifiers(doc) {
  const out = [];
  for (const { name, schema, at } of namedScalars(doc)) {
    const t = words(name);
    if ((t.at(-1) === 'id' || t.at(-1) === 'ids') && schema.format === 'uuid') out.push(finding(`Identifier "${name}" should not be qualified as format uuid`, [...at, 'format']));
  }
  return out;
}
