import { isObj, deref, operations, responses, requestBody, mediaTypes, schemas, properties, objectView, typesOf, effectiveTypes, enumValues, isExtensibleEnumDescription, isJsonMediaType, isObjectSchema, isMapSchema, words, finding } from '../lib/oas.js';
import pluralize from '../lib/pluralize.js';
import { IANA_MEDIA_TYPES } from '../lib/media-types.js';

function* contentMaps(doc) {
  for (const op of operations(doc)) {
    const body = requestBody(doc, op);
    if (body) yield { container: body.body, at: body.at, kind: 'request', op };
    for (const r of responses(doc, op)) yield { container: r.response, at: r.at, kind: 'response', op, code: r.code };
  }
}

const STRUCTURED_NON_JSON = /^(application|text)\/(?:[\w.+-]+\+)?(xml|csv|ya?ml|x-ya?ml)$|^application\/x-www-form-urlencoded$/i;

// #167: structured data as JSON (other structured formats only next to it), in UTF-8.
export function jsonPayload(doc) {
  const out = [];
  for (const { container, at } of contentMaps(doc)) {
    const types = [...mediaTypes(container, at)];
    const hasJson = types.some((m) => isJsonMediaType(m.type));
    for (const m of types) {
      const [base, ...params] = m.type.split(';').map((s) => s.trim());
      if (STRUCTURED_NON_JSON.test(base) && !hasJson) out.push(finding(`${base} carries structured data: offer application/json (other formats only in addition, by content negotiation)`, m.at));
      const charset = params.find((x) => /^charset=/i.test(x));
      if (charset && !/^charset="?utf-8"?$/i.test(charset)) out.push(finding(`JSON must be UTF-8, not ${charset}`, m.at));
    }
  }
  return out;
}

// #167: a JSON object as top-level request payload, if possible.
export function jsonObjectRequest(doc) {
  const out = [];
  for (const { container, at, kind } of contentMaps(doc)) {
    if (kind !== 'request') continue;
    for (const m of mediaTypes(container, at)) {
      if (!isJsonMediaType(m.type) || /patch\+json/i.test(m.type) || !isObj(m.media.schema)) continue;
      if (!isObjectSchema(doc, m.media.schema) && !hasObjectBranches(doc, m.media.schema)) out.push(finding('Use a JSON object as top-level request payload, so it can be extended', [...m.at, 'schema']));
    }
  }
  return out;
}

function hasObjectBranches(doc, schema) {
  const { node } = deref(doc, schema);
  if (!isObj(node)) return true;
  const branches = [...(node.oneOf ?? []), ...(node.anyOf ?? [])];
  return branches.length > 0 && branches.every((b) => isObjectSchema(doc, b));
}

const READ_WRITE = [/^(?:Create|Update|New|Put|Post)([A-Z]\w*)$/, /^([A-Z]\w*?)(?:Request|Response|Input|Output|Create|Update|Dto|DTO|Read|Write|Payload|Body)$/];

// #252: one schema for reading and writing a resource, with readOnly and writeOnly.
export function singleReadWriteSchema(doc) {
  const names = isObj(doc?.components?.schemas) ? Object.keys(doc.components.schemas) : [];
  const set = new Set(names);
  const out = [];
  for (const n of names) {
    if (/Patch/.test(n)) continue;
    for (const re of READ_WRITE) {
      const m = re.exec(n);
      if (m && m[1] !== n && set.has(m[1])) {
        out.push(finding(`Schema ${n} duplicates ${m[1]} for reading or writing; use one schema and mark fields readOnly or writeOnly`, ['components', 'schemas', n]));
        break;
      }
    }
  }
  return out;
}

// #172: media types from the IANA registry; custom ones only for media type versioning (#114).
export function standardMediaTypes(doc) {
  const out = [];
  for (const { container, at } of contentMaps(doc)) {
    for (const m of mediaTypes(container, at)) {
      const [base, ...params] = m.type.split(';').map((s) => s.trim().toLowerCase());
      if (IANA_MEDIA_TYPES.has(base) || base.includes('*') || params.some((x) => x.startsWith('version='))) continue;
      out.push(finding(`${base} is not a registered media type; use a standard one such as application/json`, m.at));
    }
  }
  return out;
}

const LINKING = new Set(['to', 'of', 'by', 'for', 'in', 'on', 'at', 'from', 'with', 'and', 'or', 'per']);

const isArraySchema = (s) => typesOf(s).has('array') || (typesOf(s).size === 0 && s.items !== undefined);

// #120: array names are plural.
export function pluralArrayNames(doc) {
  const out = [];
  for (const { name, schema, at } of properties(doc)) {
    if (!isArraySchema(schema)) continue;
    const ws = words(name).filter((w) => /[a-z]/.test(w) && !LINKING.has(w));
    if (ws.length && !ws.some((w) => pluralize.isPlural(w) && !pluralize.isSingular(w)) && !ws.some((w) => pluralize.isPlural(w) && pluralize.isSingular(w) && w === ws.at(-1))) {
      out.push(finding(`Array "${name}" should have a plural name`, at));
    }
  }
  return out;
}

// #118: snake_case property names.
export function snakeCaseProperties(doc) {
  const out = [];
  for (const { name, at } of properties(doc)) {
    if (!/^[a-z_][a-z_0-9]*$/.test(name)) out.push(finding(`Property "${name}" must be snake_case (^[a-z_][a-z_0-9]*$)`, at));
  }
  return out;
}

const OUTSIDE_VALUES = new Set(['iso-639-1', 'bcp47', 'iso-3166-alpha-2', 'iso-4217', 'tz-id']);

// #240: enum values in UPPER_SNAKE_CASE, except values sourced from outside the API and sort values.
export function upperSnakeEnums(doc) {
  const out = [];
  for (const { schema, at, param, kind, name } of schemas(doc)) {
    if (OUTSIDE_VALUES.has(schema.format) || param?.name === 'sort' || (kind === 'properties' && name === 'sort')) continue;
    const values = [...enumValues(schema), ...(isExtensibleEnumDescription(schema) && Array.isArray(schema.examples) ? schema.examples : [])];
    const bad = values.filter((v) => typeof v === 'string' && !/^[A-Z][A-Z0-9_]*$/.test(v));
    if (bad.length) out.push(finding(`Enum values ${bad.map((v) => `"${v}"`).join(', ')} should be UPPER_SNAKE_CASE`, at));
  }
  return out;
}

const DATE_NAME = [/^.+_at$/, /date|day|time/];
const POINT_FORMATS = new Set(['date', 'date-time', 'time', 'time-local', 'date-time-local']);

// #235: date and time properties end in _at or say date, day, time or timestamp.
export function dateTimeNames(doc) {
  const out = [];
  for (const { name, schema, at } of properties(doc)) {
    if (POINT_FORMATS.has(schema.format) && !DATE_NAME.some((re) => re.test(name))) {
      out.push(finding(`"${name}" holds a ${schema.format}: end the name in _at, or let it say date, day, time or timestamp`, at));
    }
  }
  return out;
}

// #216: maps through additionalProperties, with nothing else defined, and the keys described.
export function maps(doc) {
  const out = [];
  for (const { schema, at } of schemas(doc)) {
    const extra = schema.additionalProperties;
    if (!(extra === true || isObj(extra))) continue;
    if (isObj(schema.properties) && Object.keys(schema.properties).length) {
      out.push(finding('A map (additionalProperties) should define no other properties', at));
    } else if (typeof schema.description !== 'string' || !schema.description.trim()) {
      out.push(finding('Describe the format of the map keys in the description', at));
    }
  }
  return out;
}

// #122: booleans are never null.
export function booleanNotNull(doc) {
  const out = [];
  for (const { schema, at } of schemas(doc)) {
    const t = effectiveTypes(doc, schema);
    if (t.has('boolean') && t.has('null')) out.push(finding('A boolean must not be null; use an enum of named values if null has a meaning', at));
  }
  return out;
}

// #124: empty arrays are [], not null.
export function arrayNotNull(doc) {
  const out = [];
  for (const { schema, at } of schemas(doc)) {
    const t = effectiveTypes(doc, schema);
    if (t.has('array') && t.has('null')) out.push(finding('An array should not be null; use the empty array', at));
  }
  return out;
}

// #174: id is an opaque string, references end in _id, the embedded ETag is e_tag.
export function commonFieldNames(doc) {
  const out = [];
  for (const { name, schema, at } of properties(doc)) {
    const t = words(name);
    const last = t.at(-1);
    let target = schema;
    if (last === 'ids' && isArraySchema(schema)) target = deref(doc, schema.items).node ?? {};
    const types = typesOf(target);
    if ((last === 'id' || last === 'ids') && (types.has('integer') || types.has('number'))) out.push(finding(`Identifier "${name}" must be a string, not a number`, at));
    if (['etag', 'entity_tag'].includes(name.toLowerCase().replace(/-/g, '_'))) out.push(finding(`Name the embedded ETag "e_tag"`, at));
    if (t.length > 1 && ['identifier', 'uuid', 'guid'].includes(last)) out.push(finding(`Reference "${name}": name it ${t.slice(0, -1).join('_')}_id`, at));
  }
  return out;
}

const ADDRESS_NAMES = {
  street_name: 'street', street_address: 'street', address_line_1: 'street', address_line1: 'street', line1: 'street',
  line_1: 'street', address1: 'street', address_1: 'street', house_number: 'street (with the house number)',
  address_line_2: 'additional', address_line2: 'additional', line2: 'additional', line_2: 'additional', address2: 'additional',
  address_2: 'additional', town: 'city', locality: 'city', zip_code: 'zip', zipcode: 'zip', postal_code: 'zip',
  postalcode: 'zip', postcode: 'zip', post_code: 'zip', country: 'country_code', c_o: 'care_of', careof: 'care_of',
};
const ADDRESS_FIELDS = new Set(['street', 'city', 'zip', 'country_code', 'care_of', 'additional', ...Object.keys(ADDRESS_NAMES)]);
const ADDRESSEE_NAMES = {
  firstname: 'first_name', given_name: 'first_name', given_names: 'first_name', forename: 'first_name',
  lastname: 'last_name', surname: 'last_name', family_name: 'last_name', company_name: 'business_name',
  organization_name: 'business_name',
};
const ADDRESSEE_FIELDS = new Set(['first_name', 'last_name', 'salutation', 'business_name', ...Object.keys(ADDRESSEE_NAMES)]);

// #249: address and addressee fields use the common names.
export function addressFields(doc) {
  const out = [];
  for (const { schema, at } of schemas(doc)) {
    if (!isObj(schema.properties)) continue;
    const names = Object.keys(schema.properties);
    const addressLike = names.filter((n) => ADDRESS_FIELDS.has(n)).length >= 2 && names.some((n) => ['street', 'city', 'zip', 'town', 'postal_code', 'zip_code', 'postcode', 'address_line_1', 'line1', 'street_name'].includes(n));
    const personLike = names.filter((n) => ADDRESSEE_FIELDS.has(n)).length >= 2;
    for (const n of names) {
      if (addressLike && ADDRESS_NAMES[n]) out.push(finding(`Address field "${n}": use the common field ${ADDRESS_NAMES[n]}`, [...at, 'properties', n]));
      if (personLike && ADDRESSEE_NAMES[n]) out.push(finding(`Addressee field "${n}": use the common field ${ADDRESSEE_NAMES[n]}`, [...at, 'properties', n]));
    }
  }
  return out;
}

const MONEY_NAME = /^(price|cost|fee|grand_total|sub_total|subtotal|net_total|gross_total|tax_total|.+_(price|cost|fee|amount))$/;

// #173: money as the common Money object { amount (decimal), currency (iso-4217) }, closed.
export function moneyObject(doc) {
  const out = [];
  const moneyShaped = new Set();
  for (const { schema, at } of schemas(doc)) {
    if (!isObj(schema.properties) && !Array.isArray(schema.allOf)) continue;
    const view = objectView(doc, schema);
    const props = view.properties;
    if (!('amount' in props) || !('currency' in props || 'currency_code' in props)) continue;
    moneyShaped.add(schema);
    const amount = deref(doc, props.amount).node ?? {};
    if (!typesOf(amount).has('number') || amount.format !== 'decimal') out.push(finding('Money amount must be type number with format decimal', at));
    if ('currency_code' in props) out.push(finding('Money uses "currency" (format iso-4217), not "currency_code"', at));
    const currency = deref(doc, props.currency ?? props.currency_code).node ?? {};
    if (currency.format !== 'iso-4217') out.push(finding('Money currency needs format iso-4217', at));
    if (!view.required.has('amount') || !view.required.has('currency')) out.push(finding('Money requires amount and currency', at));
    const extra = Object.keys(props).filter((k) => k !== 'amount' && k !== 'currency' && k !== 'currency_code');
    if (extra.length) out.push(finding(`Money is closed: move ${extra.join(', ')} to their own Money objects`, at));
  }
  for (const { name, schema, at, parent } of properties(doc)) {
    if (moneyShaped.has(parent)) continue;
    const t = typesOf(schema);
    if ((t.has('number') || t.has('integer')) && MONEY_NAME.test(name)) out.push(finding(`"${name}" looks like money: use the common Money object (amount and currency)`, at));
  }
  return out;
}
