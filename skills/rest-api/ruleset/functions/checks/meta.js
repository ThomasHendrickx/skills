import { isObj, operations, deref, finding } from '../lib/oas.js';

const filled = (v) => typeof v === 'string' && v.trim() !== '';

// #218: title, version, description and contact of the owning team.
export function infoFields(doc) {
  const info = doc?.info;
  if (!isObj(info)) return [finding('Add the `info` object with title, version, description and contact', [])];
  const out = [];
  for (const key of ['title', 'version', 'description']) if (!filled(info[key])) out.push(finding(`Add \`info.${key}\``, ['info']));
  for (const key of ['name', 'url', 'email']) {
    if (!filled(info.contact?.[key])) out.push(finding(`Add \`info.contact.${key}\` of the team owning the API`, info.contact ? ['info', 'contact'] : ['info']));
  }
  return out;
}

// #218: Zalando's API id and audience extensions.
export function infoExtensions(doc) {
  if (!isObj(doc?.info)) return [];
  return ['x-api-id', 'x-audience'].filter((k) => !filled(doc.info[k])).map((k) => finding(`Add \`info.${k}\``, ['info']));
}

// #116: MAJOR.MINOR.PATCH, no pre-release or build metadata.
export function semanticVersion(doc) {
  const v = doc?.info?.version;
  if (typeof v !== 'string') return [];
  if (/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(v)) return [];
  return [finding(`Version "${v}" is not MAJOR.MINOR.PATCH (no pre-release or build suffix)`, ['info', 'version'])];
}

// #215: globally unique, immutable API id.
export function apiIdentifier(doc) {
  const id = doc?.info?.['x-api-id'];
  if (typeof id !== 'string' || /^[a-z0-9][a-z0-9:.-]{6,62}[a-z0-9]$/.test(id)) return [];
  return [finding(`x-api-id "${id}" must match ^[a-z0-9][a-z0-9-:.]{6,62}[a-z0-9]$ (a UUID works)`, ['info', 'x-api-id'])];
}

const AUDIENCES = ['component-internal', 'business-unit-internal', 'company-internal', 'external-partner', 'external-public'];

// #219: exactly one of the five audiences.
export function apiAudience(doc) {
  const a = doc?.info?.['x-audience'];
  if (a === undefined || AUDIENCES.includes(a)) return [];
  return [finding(`x-audience must be one of ${AUDIENCES.join(', ')}`, ['info', 'x-audience'])];
}

const FUNCTIONAL_HOST = /^[a-z][a-z0-9-]*-[a-z][a-z0-9-]*\.zalandoapis\.com$/;
const LEGACY_HOST = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*\.zalan\.do$/;
const PARTNER_EXCEPTIONS = new Set(['api.merchants.zalando.com', 'api-sandbox.merchants.zalando.com']);

function* hosts(doc) {
  if (!Array.isArray(doc?.servers)) return;
  for (const [i, s] of doc.servers.entries()) {
    if (!isObj(s) || typeof s.url !== 'string' || s.url.includes('{')) continue;
    let host;
    try {
      host = new URL(s.url).hostname;
    } catch {
      continue;
    }
    if (host === 'localhost' || /^[\d.]+$/.test(host)) continue;
    yield { host, at: ['servers', i, 'url'] };
  }
}

// #224 with #223: external APIs must use <functional-name>.zalandoapis.com; the legacy
// <application>.<team>.zalan.do form is only allowed for component-internal APIs.
export function functionalHostnames(doc) {
  const audience = doc?.info?.['x-audience'];
  const out = [];
  for (const { host, at } of hosts(doc)) {
    if (audience === 'external-public' || audience === 'external-partner') {
      if (!FUNCTIONAL_HOST.test(host) && !(audience === 'external-partner' && PARTNER_EXCEPTIONS.has(host))) {
        out.push(finding(`Host "${host}" must be <functional-name>.zalandoapis.com for ${audience} APIs`, at));
      }
    } else if (audience !== 'component-internal' && LEGACY_HOST.test(host)) {
      out.push(finding(`Host "${host}" uses the legacy zalan.do form, only allowed for component-internal APIs`, at));
    }
  }
  return out;
}

// #223: internal APIs should use functional hostnames too.
export function functionalNaming(doc) {
  const audience = doc?.info?.['x-audience'];
  if (audience !== 'company-internal' && audience !== 'business-unit-internal') return [];
  const out = [];
  for (const { host, at } of hosts(doc)) {
    if (!FUNCTIONAL_HOST.test(host) && !LEGACY_HOST.test(host)) out.push(finding(`Host "${host}" should be <functional-name>.zalandoapis.com`, at));
  }
  return out;
}

function securitySchemes(doc) {
  return isObj(doc?.components?.securitySchemes) ? doc.components.securitySchemes : {};
}

function effectiveSecurity(doc, op) {
  if (Array.isArray(op.op.security)) return { list: op.op.security, at: [...op.at, 'security'] };
  if (Array.isArray(doc.security)) return { list: doc.security, at: ['security'] };
  return { list: undefined, at: op.at };
}

// #104: every endpoint protected with an http bearer or oauth2 scheme.
export function securedEndpoints(doc) {
  const out = [];
  const defined = securitySchemes(doc);
  for (const [name, raw] of Object.entries(defined)) {
    const { node: s } = deref(doc, raw, ['components', 'securitySchemes', name]);
    if (!isObj(s)) continue;
    const ok = s.type === 'oauth2' || (s.type === 'http' && String(s.scheme).toLowerCase() === 'bearer');
    if (!ok) out.push(finding(`Security scheme "${name}" must be http bearer or oauth2, not ${s.type}${s.scheme ? ` ${s.scheme}` : ''}`, ['components', 'securitySchemes', name]));
  }
  for (const op of operations(doc)) {
    const { list, at } = effectiveSecurity(doc, op);
    const label = at[0] === 'security' ? 'The global security requirement' : `${op.method.toUpperCase()} ${op.path}`;
    if (!list || list.length === 0) {
      out.push(finding(`${op.method.toUpperCase()} ${op.path} is not secured; add a security requirement`, op.at));
      continue;
    }
    list.forEach((req, i) => {
      if (!isObj(req) || Object.keys(req).length === 0) {
        out.push(finding(`${label} allows anonymous access through an empty security requirement`, [...at, i]));
        return;
      }
      for (const name of Object.keys(req)) if (!(name in defined)) out.push(finding(`Security scheme "${name}" is not defined in components.securitySchemes`, [...at, i, name]));
    });
  }
  return dedupeByPath(out);
}

// #105: every endpoint names the permissions (scopes) it requires.
export function permissions(doc) {
  const out = [];
  for (const op of operations(doc)) {
    const { list, at } = effectiveSecurity(doc, op);
    if (!Array.isArray(list)) continue;
    const who = at[0] === 'security' ? 'The global security requirement' : `${op.method.toUpperCase()} ${op.path}`;
    list.forEach((req, i) => {
      if (!isObj(req)) return;
      for (const [name, scopes] of Object.entries(req)) {
        if (!Array.isArray(scopes) || scopes.length === 0) {
          out.push(finding(`${who} names no permission for "${name}"; assign a scope (or the uid pseudo permission)`, [...at, i, name]));
        }
      }
    });
  }
  return dedupeByPath(out);
}

const SCOPE = /^(uid|[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)?\.(read|write))$/;

// #225: <application-id>[.<resource-name>].<read|write>, or uid.
export function permissionNames(doc) {
  const out = [];
  const check = (scope, at) => {
    if (typeof scope === 'string' && !SCOPE.test(scope)) out.push(finding(`Permission "${scope}" must be <application-id>[.<resource-name>].read|write or uid`, at));
  };
  for (const op of operations(doc)) {
    const { list, at } = effectiveSecurity(doc, op);
    if (!Array.isArray(list)) continue;
    list.forEach((req, i) => {
      if (!isObj(req)) return;
      for (const [name, scopes] of Object.entries(req)) if (Array.isArray(scopes)) scopes.forEach((s, j) => check(s, [...at, i, name, j]));
    });
  }
  for (const [name, s] of Object.entries(securitySchemes(doc))) {
    if (!isObj(s?.flows)) continue;
    for (const [flow, f] of Object.entries(s.flows)) {
      if (isObj(f?.scopes)) for (const scope of Object.keys(f.scopes)) check(scope, ['components', 'securitySchemes', name, 'flows', flow, 'scopes', scope]);
    }
  }
  return dedupeByPath(out);
}

function dedupeByPath(list) {
  const seen = new Set();
  return list.filter((f) => {
    const k = f.path.join('\u0000') + f.message;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
