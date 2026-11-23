// Compares two versions of a schema the way the guideline's compatibility rules (#107, #209) read them.
// Directions: 'request' (input: the new schema must accept every old input), 'response' (output: old
// clients must understand every new output) and 'event' (output read by consumers, where a new or newly
// required field or a changed default also breaks, #209 and #246).
import { isObj, deref, typesOf, objectView, isExtensibleEnumDescription } from '../../ruleset/functions/lib/oas.js';

export const BREAKING = 'breaking';
export const ADDITION = 'addition';
export const CHANGE = 'change';

const NUMERIC = (t) => (t === 'integer' ? ['integer', 'number'] : [t]);

function inferTypes(s) {
  const t = typesOf(s);
  if (t.size) return t;
  if (isObj(s?.properties) || s?.additionalProperties !== undefined || Array.isArray(s?.allOf)) return new Set(['object']);
  if (s?.items !== undefined) return new Set(['array']);
  if (Array.isArray(s?.enum) && s.enum.length && s.enum.every((v) => typeof v === 'string')) return new Set(['string']);
  return t;
}

// Is every type in a also in b (an integer is a number)?
const covered = (a, b) => [...a].every((t) => NUMERIC(t).some((x) => b.has(x)));

const extensibleValues = (s) => (Array.isArray(s?.['x-extensible-enum']) ? s['x-extensible-enum'] : isExtensibleEnumDescription(s) && Array.isArray(s?.examples) ? s.examples : undefined);

const upper = (s) => {
  if (!isObj(s)) return undefined;
  if (typeof s.exclusiveMaximum === 'number') return { v: s.exclusiveMaximum, x: true };
  if (typeof s.maximum === 'number') return { v: s.maximum, x: s.exclusiveMaximum === true };
  return undefined;
};
const lower = (s) => {
  if (!isObj(s)) return undefined;
  if (typeof s.exclusiveMinimum === 'number') return { v: s.exclusiveMinimum, x: true };
  if (typeof s.minimum === 'number') return { v: s.minimum, x: s.exclusiveMinimum === true };
  return undefined;
};
// a bound b2 is tighter than b1 (for an upper bound when dir = -1, lower when dir = 1)
const tighter = (b1, b2, sign) => {
  if (!b2) return false;
  if (!b1) return true;
  if (b2.v === b1.v) return b2.x && !b1.x;
  return sign * (b2.v - b1.v) > 0;
};

const fmt = (v) => JSON.stringify(v);

export class SchemaComparison {
  constructor(oldDoc, newDoc) {
    this.oldDoc = oldDoc;
    this.newDoc = newDoc;
    this.changes = [];
    this.seen = new Set();
  }

  add(kind, where, message, extra = {}) {
    this.changes.push({ kind, where, message, dir: this.dir, ...extra });
  }

  // Entry point: compares two schemas in one direction; where names the place for the report.
  run(oldRaw, newRaw, dir, where) {
    this.dir = dir;
    this.compare(oldRaw, newRaw, dir, where);
  }

  compare(oldRaw, newRaw, dir, whereIn) {
    if (oldRaw === undefined && newRaw === undefined) return;
    if (isObj(oldRaw) && isObj(newRaw) && typeof oldRaw.$ref === 'string' && typeof newRaw.$ref === 'string' && !oldRaw.$ref.startsWith('#') && !newRaw.$ref.startsWith('#')) {
      if (oldRaw.$ref !== newRaw.$ref) this.add(CHANGE, whereIn, `external reference changed from ${oldRaw.$ref} to ${newRaw.$ref}; compare by hand`, { review: true });
      return;
    }
    const o = deref(this.oldDoc, oldRaw);
    const n = deref(this.newDoc, newRaw);
    const component = (raw, path) => (isObj(raw) && typeof raw.$ref === 'string' && raw.$ref.startsWith('#/') ? path.join('.') : undefined);
    const where = component(newRaw, n.path) ?? component(oldRaw, o.path) ?? whereIn;
    const key = `${dir}|${o.path?.join('/')}|${n.path?.join('/')}|${o.node === oldRaw ? where : ''}`;
    if (o.node !== undefined && n.node !== undefined && (o.path?.length || n.path?.length) && this.seen.has(key)) return;
    this.seen.add(key);
    const os = o.node;
    const ns = n.node;
    if (o.external || n.external) {
      this.add(CHANGE, where, 'schema switched between an external reference and an inline schema; compare by hand', { review: true });
      return;
    }
    const output = dir !== 'request';
    if (!isObj(os) && isObj(ns)) {
      if (dir === 'request') this.add(BREAKING, where, 'a schema now constrains a value that accepted anything');
      return;
    }
    if (isObj(os) && !isObj(ns)) {
      if (output) this.add(BREAKING, where, 'the schema was dropped; the value is no longer described');
      return;
    }
    if (!isObj(os)) return;
    this.types(os, ns, dir, where);
    this.format(os, ns, dir, where);
    this.enums(os, ns, dir, where);
    this.constValue(os, ns, where);
    if (dir === 'request' || dir === 'event') this.defaults(os, ns, dir, where);
    if (dir === 'request') this.constraints(os, ns, where);
    this.objects(os, ns, dir, where);
    this.arrays(os, ns, dir, where);
    this.variants(os, ns, dir, where);
  }

  types(os, ns, dir, where) {
    const to = inferTypes(os);
    const tn = inferTypes(ns);
    if (!to.size && !tn.size) return;
    const list = (t) => [...t].join('|') || 'any';
    if (dir === 'request') {
      if (!tn.size) return;
      if (!to.size || !covered(to, tn)) this.add(BREAKING, where, `type changed from ${list(to)} to ${list(tn)}; old input is rejected`);
      else if (!covered(tn, to)) this.add(ADDITION, where, `type widened from ${list(to)} to ${list(tn)}`);
    } else {
      if (!to.size) return;
      if (!tn.size || !covered(tn, to)) this.add(BREAKING, where, tn.has('null') && !to.has('null') ? 'the value can now be null' : `type changed from ${list(to)} to ${list(tn)}`);
    }
  }

  format(os, ns, dir, where) {
    if (os.format === ns.format) return;
    const widening = { int32: 'int64', float: 'double' };
    if (dir === 'request') {
      if (ns.format === undefined || widening[os.format] === ns.format) this.add(ADDITION, where, `format relaxed from ${os.format} to ${ns.format ?? 'none'}`);
      else this.add(BREAKING, where, `format changed from ${os.format ?? 'none'} to ${ns.format}`);
    } else if (os.format === undefined || widening[ns.format] === os.format) {
      this.add(CHANGE, where, `format narrowed from ${os.format ?? 'none'} to ${ns.format}`);
    } else this.add(BREAKING, where, `format changed from ${os.format} to ${ns.format ?? 'none'}`);
  }

  enums(os, ns, dir, where) {
    const eo = Array.isArray(os.enum) ? os.enum : undefined;
    const en = Array.isArray(ns.enum) ? ns.enum : undefined;
    const has = (list, v) => list.some((x) => fmt(x) === fmt(v));
    if (eo || en) {
      if (eo && en) {
        const removed = eo.filter((v) => !has(en, v));
        const added = en.filter((v) => !has(eo, v));
        if (dir === 'request') {
          if (removed.length) this.add(BREAKING, where, `enum values removed: ${removed.map(fmt).join(', ')}`);
          if (added.length) this.add(ADDITION, where, `enum values added: ${added.map(fmt).join(', ')}`);
        } else {
          if (added.length) this.add(BREAKING, where, `values added to a closed enum: ${added.map(fmt).join(', ')}; old clients may not handle them (use an extensible enum, #112)`);
          if (removed.length) this.add(CHANGE, where, `enum values no longer returned: ${removed.map(fmt).join(', ')}`);
        }
      } else if (en && dir === 'request') this.add(BREAKING, where, 'an enum now restricts the accepted values');
      else if (eo && dir !== 'request' && !extensibleValues(ns)) this.add(BREAKING, where, 'the closed enum was removed; any value can now be returned');
      else this.add(dir === 'request' ? ADDITION : CHANGE, where, en ? 'values restricted to an enum' : 'enum restriction removed');
    }
    const xo = extensibleValues(os);
    const xn = extensibleValues(ns);
    if (xo && xn) {
      const removed = xo.filter((v) => !has(xn, v));
      const added = xn.filter((v) => !has(xo, v));
      if (removed.length) this.add(dir === 'request' ? BREAKING : CHANGE, where, `extensible enum values removed: ${removed.map(fmt).join(', ')}`);
      if (added.length) this.add(ADDITION, where, `extensible enum values added: ${added.map(fmt).join(', ')}`);
    }
  }

  constValue(os, ns, where) {
    if (os.const !== undefined && ns.const !== undefined && fmt(os.const) !== fmt(ns.const)) this.add(BREAKING, where, `const changed from ${fmt(os.const)} to ${fmt(ns.const)}`);
  }

  defaults(os, ns, dir, where) {
    if (os.default !== undefined && fmt(os.default) !== fmt(ns.default)) this.add(BREAKING, where, `default changed from ${fmt(os.default)} to ${ns.default === undefined ? 'none' : fmt(ns.default)}`);
    else if (os.default === undefined && ns.default !== undefined && dir === 'event') this.add(BREAKING, where, `default ${fmt(ns.default)} added`);
  }

  constraints(os, ns, where) {
    const num = (v) => (typeof v === 'number' ? v : undefined);
    const tightenedMax = (k) => num(ns[k]) !== undefined && (num(os[k]) === undefined || ns[k] < os[k]);
    const tightenedMin = (k) => num(ns[k]) !== undefined && ns[k] > (num(os[k]) ?? 0);
    for (const k of ['maxLength', 'maxItems', 'maxProperties']) if (tightenedMax(k)) this.add(BREAKING, where, `${k} tightened from ${os[k] ?? 'none'} to ${ns[k]}`);
    for (const k of ['minLength', 'minItems', 'minProperties']) if (tightenedMin(k)) this.add(BREAKING, where, `${k} tightened from ${os[k] ?? 'none'} to ${ns[k]}`);
    if (tighter(upper(os), upper(ns), -1)) this.add(BREAKING, where, `maximum tightened from ${upper(os)?.v ?? 'none'} to ${upper(ns).v}`);
    if (tighter(lower(os), lower(ns), 1)) this.add(BREAKING, where, `minimum tightened from ${lower(os)?.v ?? 'none'} to ${lower(ns).v}`);
    if (ns.pattern !== undefined && ns.pattern !== os.pattern) this.add(BREAKING, where, os.pattern ? `pattern changed from ${os.pattern} to ${ns.pattern}` : `pattern ${ns.pattern} added`);
    if (ns.uniqueItems === true && os.uniqueItems !== true) this.add(BREAKING, where, 'uniqueItems added');
    if (ns.multipleOf !== undefined && ns.multipleOf !== os.multipleOf) this.add(BREAKING, where, `multipleOf changed to ${ns.multipleOf}`);
  }

  objects(os, ns, dir, where) {
    const objectish = (s) => inferTypes(s).has('object') || isObj(s.properties) || Array.isArray(s.allOf);
    if (!objectish(os) && !objectish(ns)) return;
    const vo = objectView(this.oldDoc, os);
    const vn = objectView(this.newDoc, ns);
    const visible = (doc, raw) => {
      const s = deref(doc, raw).node;
      if (dir === 'request') return !s?.readOnly;
      return !s?.writeOnly;
    };
    const po = Object.fromEntries(Object.entries(vo.properties).filter(([, v]) => visible(this.oldDoc, v)));
    const pn = Object.fromEntries(Object.entries(vn.properties).filter(([, v]) => visible(this.newDoc, v)));
    for (const name of Object.keys(po)) {
      const w = `${where}.${name}`;
      if (!(name in pn)) {
        const node = deref(this.oldDoc, po[name]).node ?? {};
        this.add(BREAKING, w, `property "${name}" removed`, { removed: { node } });
        continue;
      }
      const reqO = vo.required.has(name);
      const reqN = vn.required.has(name);
      if (dir === 'request') {
        if (!reqO && reqN) this.add(BREAKING, w, `property "${name}" became required`);
        if (reqO && !reqN) this.add(ADDITION, w, `property "${name}" became optional`);
      } else if (reqO && !reqN) this.add(BREAKING, w, `property "${name}" is no longer always present`);
      else if (!reqO && reqN) this.add(dir === 'event' ? BREAKING : CHANGE, w, `property "${name}" became required${dir === 'event' ? '; events published before do not have it' : ''}`);
      this.compare(po[name], pn[name], dir, w);
    }
    for (const name of Object.keys(pn)) {
      if (name in po) continue;
      const w = `${where}.${name}`;
      const req = vn.required.has(name);
      if (req && (dir === 'request' || dir === 'event')) this.add(BREAKING, w, `required property "${name}" added`);
      else this.add(ADDITION, w, `${req ? 'required' : 'optional'} property "${name}" added`);
    }
    const ao = vo.additionalProperties;
    const an = vn.additionalProperties;
    if (dir === 'request' && an === false && ao !== false) this.add(BREAKING, where, 'additional properties are no longer accepted');
    if (isObj(ao) && isObj(an)) this.compare(ao, an, dir, `${where}.*`);
  }

  arrays(os, ns, dir, where) {
    if (os.items !== undefined || ns.items !== undefined) {
      if (isObj(os.items) || isObj(ns.items)) this.compare(os.items, ns.items, dir, `${where}[]`);
    }
  }

  variants(os, ns, dir, where) {
    for (const key of ['oneOf', 'anyOf']) {
      const vo = Array.isArray(os[key]) ? os[key] : [];
      const vn = Array.isArray(ns[key]) ? ns[key] : [];
      if (!vo.length && !vn.length) continue;
      const name = (s) => (isObj(s) && typeof s.$ref === 'string' ? s.$ref.split('/').pop() : undefined);
      const matched = new Set();
      vo.forEach((s, i) => {
        const j = name(s) ? vn.findIndex((x) => name(x) === name(s)) : i < vn.length ? i : -1;
        if (j === -1) {
          this.add(dir === 'request' ? BREAKING : CHANGE, where, `${key} variant ${name(s) ?? i} removed`);
          return;
        }
        matched.add(j);
        this.compare(s, vn[j], dir, `${where}<${name(s) ?? i}>`);
      });
      vn.forEach((s, j) => {
        if (!matched.has(j)) this.add(dir === 'request' ? ADDITION : BREAKING, where, `${key} variant ${name(s) ?? j} added${dir === 'request' ? '' : '; old clients do not know it'}`);
      });
    }
    const dpo = os.discriminator?.propertyName;
    const dpn = ns.discriminator?.propertyName;
    if (dpo && dpo !== dpn) this.add(BREAKING, where, `discriminator changed from ${dpo} to ${dpn ?? 'none'}`);
  }
}
