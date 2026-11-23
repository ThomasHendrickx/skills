// Event type definitions (the guideline's EventType object, as registered in Nakadi).
import { isObj, schemas, finding } from '../lib/oas.js';
import * as json from './json.js';
import * as formats from './formats.js';
import { openForExtension } from './compatibility.js';

const eventTypes = (doc) => (Array.isArray(doc) ? doc.map((e, i) => ({ et: e, at: [i] })) : [{ et: doc, at: [] }]);

function schemaOf(et) {
  const s = et?.schema?.schema;
  if (isObj(s)) return { schema: s };
  if (typeof s !== 'string') return { schema: undefined };
  try {
    return { schema: JSON.parse(s), text: true };
  } catch (e) {
    return { schema: undefined, error: e.message };
  }
}

// #197: an event type declares name, category, audience, owning application, schema and compatibility mode.
export function eventTypeFields(doc) {
  const out = [];
  for (const { et, at } of eventTypes(doc)) {
    if (!isObj(et)) continue;
    for (const k of ['name', 'category', 'audience']) if (typeof et[k] !== 'string' || !et[k].trim()) out.push(finding(`Add \`${k}\` to the event type`, at));
    const { schema, error } = schemaOf(et);
    if (!isObj(et.schema)) out.push(finding('Add the `schema` of the event payload', at));
    else {
      if (et.schema.type !== 'json_schema') out.push(finding('schema.type must be json_schema', [...at, 'schema']));
      if (error) out.push(finding(`schema.schema is not valid JSON: ${error}`, [...at, 'schema', 'schema']));
      else if (!schema) out.push(finding('Add schema.schema, the JSON schema of the payload', [...at, 'schema']));
    }
  }
  return out;
}

const FUNCTIONAL = /^[a-z][a-z0-9-]*-[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*(\.[Vv][0-9.]+)?$/;
const ANY_NAME = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*){1,2}(\.[Vv][0-9.]+)?$/;

// #213: <functional-name>.<event-name>[.<version>]; the legacy application form only for internal audiences.
export function eventTypeName(doc) {
  const out = [];
  for (const { et, at } of eventTypes(doc)) {
    if (typeof et?.name !== 'string') continue;
    const external = /^external-/.test(et.audience ?? '');
    if (external ? !FUNCTIONAL.test(et.name) : !ANY_NAME.test(et.name)) {
      out.push(finding(`Event type name "${et.name}" must be <functional-name>.<event-name>[.<version>]${external ? ' for external audiences' : ''}`, [...at, 'name']));
    }
  }
  return out;
}

// #207: ownership through owning_application.
export function eventOwnership(doc) {
  return eventTypes(doc).filter(({ et }) => isObj(et) && (typeof et.owning_application !== 'string' || !et.owning_application.trim()))
    .map(({ at }) => finding('Name the owning application in `owning_application`', at));
}

// #245: an explicit compatibility mode.
export function compatibilityMode(doc) {
  return eventTypes(doc).filter(({ et }) => isObj(et) && !['compatible', 'forward', 'none'].includes(et.compatibility_mode))
    .map(({ et, at }) => finding(`Set compatibility_mode to compatible, forward or none${et.compatibility_mode ? `, not ${et.compatibility_mode}` : ''}`, et.compatibility_mode ? [...at, 'compatibility_mode'] : at));
}

// #198: a known category; metadata is reserved for the category's structure.
export function eventCategory(doc) {
  const out = [];
  for (const { et, at } of eventTypes(doc)) {
    if (!isObj(et) || et.category === undefined) continue;
    if (!['general', 'business', 'data'].includes(et.category)) out.push(finding(`Category must be general (business in Nakadi) or data, not ${et.category}`, [...at, 'category']));
    const { schema } = schemaOf(et);
    if (isObj(schema?.properties) && 'metadata' in schema.properties) out.push(finding('"metadata" is reserved for the event metadata; do not define it in the payload schema', [...at, 'schema', 'schema']));
  }
  return out;
}

const FORBIDDEN = ['additionalItems', 'contains', 'patternProperties', 'dependencies', 'propertyNames', 'const', 'not', 'oneOf'];

function* nodes(value, path = []) {
  if (value === null || typeof value !== 'object') return;
  yield { node: value, path };
  for (const [k, v] of Object.entries(value)) if (!['example', 'examples', 'default', 'enum'].includes(k)) yield* nodes(v, [...path, k]);
}

// #196: the OpenAPI schema object, so no keywords it removes from JSON Schema.
export function openApiSchemaObject(doc) {
  const out = [];
  for (const { et, at } of eventTypes(doc)) {
    const { schema } = schemaOf(et);
    for (const { node, path } of nodes(schema)) {
      for (const k of FORBIDDEN) if (k in node && path.at(-1) !== 'properties') out.push(finding(`Do not use "${k}" in event schemas (at ${['$', ...path].join('.')})`, [...at, 'schema', 'schema']));
    }
  }
  return out;
}

// #210: no additionalProperties in event schemas; never true.
export function noAdditionalProperties(doc) {
  const out = [];
  for (const { et, at } of eventTypes(doc)) {
    const { schema } = schemaOf(et);
    for (const { node, path } of nodes(schema)) {
      if ('additionalProperties' in node && path.at(-1) !== 'properties') {
        out.push(finding(`${node.additionalProperties === true ? 'Never declare additionalProperties: true' : 'Avoid additionalProperties'} in event schemas; define new optional fields before publishing them (at ${['$', ...path].join('.')})`, [...at, 'schema', 'schema']));
      }
    }
  }
  return out;
}

// #246: the schema version is MAJOR.MINOR.PATCH.
export function eventSchemaVersion(doc) {
  return eventTypes(doc).filter(({ et }) => et?.schema?.version !== undefined && !/^\d+\.\d+\.\d+$/.test(String(et.schema.version)))
    .map(({ et, at }) => finding(`Schema version "${et.schema.version}" is not MAJOR.MINOR.PATCH`, [...at, 'schema', 'version']));
}

// #242: data change events state their ordering; #203: general events should.
export function dataChangeOrdering(doc) {
  return eventTypes(doc).filter(({ et }) => et?.category === 'data' && !(Array.isArray(et.ordering_key_fields) && et.ordering_key_fields.length))
    .map(({ at }) => finding('A data change event type must set ordering_key_fields (unless the data is append-only)', at));
}

export function generalOrdering(doc) {
  const out = [];
  for (const { et, at } of eventTypes(doc)) {
    if (!['general', 'business'].includes(et?.category)) continue;
    if (!(Array.isArray(et.ordering_key_fields) && et.ordering_key_fields.length)) out.push(finding('Set ordering_key_fields so consumers can restore the business order', at));
    else if (!(Array.isArray(et.ordering_instance_ids) && et.ordering_instance_ids.length)) out.push(finding('Set ordering_instance_ids to name the entity the ordering applies to', at));
  }
  return out;
}

// #204: data change events use the hash partition strategy, keyed on the entity.
export function hashPartitioning(doc) {
  return eventTypes(doc).filter(({ et }) => et?.category === 'data' && (et.partition_strategy !== 'hash' || !(Array.isArray(et.partition_key_fields) && et.partition_key_fields.length)))
    .map(({ at }) => finding('Use partition_strategy hash with partition_key_fields naming the changed entity', at));
}

const SENSITIVE = new Set(['email', 'email_address', 'phone', 'phone_number', 'mobile_number', 'first_name', 'last_name', 'full_name', 'birth_date', 'date_of_birth', 'birthday', 'street', 'address', 'iban', 'bic', 'credit_card', 'card_number', 'password', 'ssn', 'tax_id', 'passport_number', 'ip_address']);

// #200: no personal or sensitive data in events unless the business needs it.
export function sensitiveData(doc) {
  const out = [];
  for (const { et, at } of eventTypes(doc)) {
    const { schema } = schemaOf(et);
    for (const { node, path } of nodes(schema)) {
      if (path.at(-1) !== 'properties' || !isObj(node)) continue;
      for (const k of Object.keys(node)) if (SENSITIVE.has(k.toLowerCase())) out.push(finding(`"${k}" is sensitive data; publish it only if the business needs it (at ${['$', ...path, k].join('.')})`, [...at, 'schema', 'schema']));
    }
  }
  return out;
}

// #208: the API guidelines apply to event payloads too. The payload schema is checked as a schema
// component with the JSON and data format checks; findings name the rule they come from.
const MUST = { 118: json.snakeCaseProperties, 122: json.booleanNotNull, 174: json.commonFieldNames, 173: json.moneyObject, 249: json.addressFields, 171: formats.numberFormats, 238: formats.standardFormats, 169: formats.dateTimeFormats, 170: formats.codeFormats, 239: formats.base64url, 111: openForExtension };
const SHOULD = { 120: json.pluralArrayNames, 124: json.arrayNotNull, 240: json.upperSnakeEnums, 235: json.dateTimeNames, 216: json.maps, 127: formats.durations, 255: formats.appropriateDateTime, 144: formats.uuidIdentifiers };

function applyApiChecks(doc, table) {
  const out = [];
  for (const { et, at } of eventTypes(doc)) {
    const { schema } = schemaOf(et);
    if (!isObj(schema)) continue;
    const pseudo = { openapi: '3.0.3', components: { schemas: { Event: schema } }, definitions: schema.definitions, $defs: schema.$defs };
    for (const [rule, check] of Object.entries(table)) {
      for (const f of check(pseudo)) {
        const inner = f.path.slice(3).join('.');
        out.push(finding(`#${rule}: ${f.message}${inner ? ` (at $.${inner})` : ''}`, [...at, 'schema', 'schema']));
      }
    }
    if (table === MUST) {
      for (const { schema: s } of schemas(pseudo)) if (Array.isArray(s['x-extensible-enum'])) out.push(finding('#112: Nakadi rejects x-extensible-enum; list the values in examples with the "[Extensible enum]" description prefix', [...at, 'schema', 'schema']));
    }
  }
  return out;
}

export const eventPayloadMust = (doc) => applyApiChecks(doc, MUST);
export const eventPayloadShould = (doc) => applyApiChecks(doc, SHOULD);
