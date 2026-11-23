#!/usr/bin/env node
// Compares two versions of an OpenAPI spec, or of an event type, against the guideline's compatibility,
// versioning and deprecation rules (#106, #107, #116, #185, #187, #215; for event types #209, #246).
//
//   node diff.mjs <base-spec> <spec>            compare two files
//   node diff.mjs --base <git-ref> <spec>       compare with the spec as it is at <git-ref>
//   node diff.mjs --events <base> <event-type>  compare two event type definitions (also with --base)
//   options: --format text|json, --today YYYY-MM-DD (for sunset dates)
//
// A breaking change fails unless the MAJOR version went up (MINOR for 0.y.z); an addition needs a MINOR
// bump; a removal needs a deprecation first and must wait for its x-sunset date. Exit 1 on any error.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import YAML from 'yaml';
import { isObj, operations, parameters, responses, requestBody, mediaTypes, headers, pathSegments, isParamSegment } from '../ruleset/functions/lib/oas.js';
import { SchemaComparison, BREAKING, ADDITION, CHANGE } from './lib/compare.mjs';

const usage = 'usage: diff.mjs [--events] [--format text|json] [--today YYYY-MM-DD] (<base-file> | --base <git-ref>) <file>';

export function parseArgs(argv) {
  const args = { format: 'text', events: false };
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--events') args.events = true;
    else if (a === '--format') args.format = argv[(i += 1)];
    else if (a === '--today') args.today = argv[(i += 1)];
    else if (a === '--base') args.gitRef = argv[(i += 1)];
    else rest.push(a);
  }
  if (args.gitRef) [args.file] = rest;
  else [args.baseFile, args.file] = rest;
  if (!args.file || (!args.gitRef && !args.baseFile) || !['text', 'json'].includes(args.format)) throw new Error(usage);
  return args;
}

const parse = (text) => YAML.parse(text, { maxAliasCount: -1 });

function readBase(args) {
  if (args.baseFile) return fs.readFileSync(args.baseFile, 'utf8');
  try {
    return execFileSync('git', ['show', `${args.gitRef}:./${args.file}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    return undefined;
  }
}

// --- versions ---------------------------------------------------------------------------------------
const semver = (v) => {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v ?? ''));
  return m ? m.slice(1).map(Number) : undefined;
};
const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

// --- OpenAPI ------------------------------------------------------------------------------------------
const norm = (p) => `/${pathSegments(p).map((s) => (isParamSegment(s) ? '{}' : s)).join('/')}`;

function opsOf(doc) {
  const map = new Map();
  for (const op of operations(doc)) map.set(`${op.method.toUpperCase()} ${norm(op.path)}`, op);
  return map;
}

function paramsOf(doc, op) {
  const list = parameters(doc, op);
  const pathNames = pathSegments(op.path).filter(isParamSegment).map((s) => s.slice(1, -1));
  const map = new Map();
  for (const p of list) {
    const key = p.param.in === 'path' ? `path:#${pathNames.indexOf(p.param.name)}` : `${p.param.in}:${p.param.in === 'header' ? p.param.name.toLowerCase() : p.param.name}`;
    map.set(key, p.param);
  }
  return map;
}

function security(doc, op) {
  const list = Array.isArray(op.op.security) ? op.op.security : Array.isArray(doc.security) ? doc.security : [];
  return list.filter(isObj).map((req) => new Map(Object.entries(req).map(([k, v]) => [k, new Set(Array.isArray(v) ? v : [])])));
}

// A client meeting an old alternative still meets some new alternative.
function securityTightened(oldAlts, newAlts) {
  if (!newAlts.length) return false;
  if (!oldAlts.length) return true;
  const within = (b, a) => [...b].every(([scheme, scopes]) => a.has(scheme) && [...scopes].every((s) => a.get(scheme).has(s)));
  return oldAlts.some((a) => !newAlts.some((b) => within(b, a)));
}

const mediaMap = (doc, container, at) => new Map([...mediaTypes(container, at)].map((m) => [m.type.toLowerCase().replace(/\s+/g, ''), m.media]));

export function compareSpecs(oldDoc, newDoc) {
  const c = new SchemaComparison(oldDoc, newDoc);
  const add = (kind, where, message, extra) => c.changes.push({ kind, where, message, ...extra });
  const oldOps = opsOf(oldDoc);
  const newOps = opsOf(newDoc);
  for (const [key, o] of oldOps) {
    const n = newOps.get(key);
    if (!n) {
      add(BREAKING, key, 'operation removed', { removed: { node: o.op } });
      continue;
    }
    // parameters
    const po = paramsOf(oldDoc, o);
    const pn = paramsOf(newDoc, n);
    for (const [k, p] of po) {
      const label = `${key} ${p.in} parameter "${p.name}"`;
      const q = pn.get(k);
      if (!q) {
        add(BREAKING, label, 'removed', { removed: { node: p } });
        continue;
      }
      if (!p.required && q.required) add(BREAKING, label, 'became required');
      if (p.required && !q.required) add(ADDITION, label, 'became optional');
      if ((p.style ?? '') !== (q.style ?? '') || (p.explode ?? '') !== (q.explode ?? '')) add(BREAKING, label, 'serialization (style, explode) changed');
      c.run(p.schema, q.schema, 'request', label);
    }
    for (const [k, q] of pn) {
      if (po.has(k)) continue;
      const label = `${key} ${q.in} parameter "${q.name}"`;
      add(q.required ? BREAKING : ADDITION, label, q.required ? 'required parameter added' : 'optional parameter added');
    }
    // request body
    const bo = requestBody(oldDoc, o);
    const bn = requestBody(newDoc, n);
    if (!bo && bn) add(bn.body.required ? BREAKING : ADDITION, `${key} request body`, bn.body.required ? 'required request body added' : 'optional request body added');
    if (bo && !bn) add(BREAKING, `${key} request body`, 'request body removed');
    if (bo && bn) {
      if (!bo.body.required && bn.body.required) add(BREAKING, `${key} request body`, 'became required');
      const mo = mediaMap(oldDoc, bo.body, bo.at);
      const mn = mediaMap(newDoc, bn.body, bn.at);
      for (const [type, m] of mo) {
        if (!mn.has(type)) add(BREAKING, `${key} request body`, `media type ${type} no longer accepted`);
        else c.run(m.schema, mn.get(type).schema, 'request', `${key} request ${type}`);
      }
      for (const type of mn.keys()) if (!mo.has(type)) add(ADDITION, `${key} request body`, `media type ${type} accepted`);
    }
    // responses
    const ro = new Map([...responses(oldDoc, o)].map((r) => [r.code, r]));
    const rn = new Map([...responses(newDoc, n)].map((r) => [r.code, r]));
    for (const [code, r] of ro) {
      const s = rn.get(code);
      if (!s) {
        add(/^2/.test(code) ? BREAKING : CHANGE, `${key} ${code}`, 'response removed');
        continue;
      }
      const mo = mediaMap(oldDoc, r.response, r.at);
      const mn = mediaMap(newDoc, s.response, s.at);
      for (const [type, m] of mo) {
        if (!mn.has(type)) add(BREAKING, `${key} ${code}`, `media type ${type} no longer returned`);
        else c.run(m.schema, mn.get(type).schema, 'response', `${key} ${code} ${type}`);
      }
      for (const type of mn.keys()) if (!mo.has(type)) add(ADDITION, `${key} ${code}`, `media type ${type} returned`);
      const ho = new Map([...headers(oldDoc, r.response, r.at)].map((h) => [h.name.toLowerCase(), h]));
      const hn = new Map([...headers(newDoc, s.response, s.at)].map((h) => [h.name.toLowerCase(), h]));
      for (const [name, h] of ho) {
        const g = hn.get(name);
        if (!g) add(BREAKING, `${key} ${code} header ${h.name}`, 'removed', { removed: { node: h.header } });
        else {
          if (h.header.required && !g.header.required) add(BREAKING, `${key} ${code} header ${h.name}`, 'no longer always present');
          c.run(h.header.schema, g.header.schema, 'response', `${key} ${code} header ${h.name}`);
        }
      }
      for (const [name, g] of hn) if (!ho.has(name)) add(ADDITION, `${key} ${code} header ${g.name}`, 'added');
    }
    for (const code of rn.keys()) if (!ro.has(code)) add(ADDITION, `${key} ${code}`, 'response added');
    // security
    if (securityTightened(security(oldDoc, o), security(newDoc, n))) add(BREAKING, `${key} security`, 'requires a scheme or scope the old requirement did not');
    if (!o.op.deprecated && n.op.deprecated) add(CHANGE, key, 'deprecated');
  }
  for (const key of newOps.keys()) if (!oldOps.has(key)) add(ADDITION, key, 'operation added');
  return c.changes;
}

// --- findings -------------------------------------------------------------------------------------------
function removalFindings(changes, today, strict) {
  const out = [];
  const seen = new Set();
  for (const ch of changes) {
    if (!ch.removed || seen.has(ch.where)) continue;
    seen.add(ch.where);
    const node = ch.removed.node ?? {};
    if (node.deprecated !== true) out.push({ level: strict ? 'error' : 'warn', rule: '187', where: ch.where, message: 'removed without being deprecated first (deprecated: true, with a sunset date and migration advice)' });
    const sunset = node['x-sunset'];
    if (typeof sunset === 'string' && sunset.slice(0, 10) > today) out.push({ level: strict ? 'error' : 'warn', rule: '185', where: ch.where, message: `removed before its sunset date ${sunset}` });
  }
  return out;
}

function versionFindings(changes, oldV, newV, { events, mode } = {}) {
  const out = [];
  const breaking = changes.filter((c) => c.kind === BREAKING);
  const additions = changes.filter((c) => c.kind === ADDITION);
  const vo = semver(oldV);
  const vn = semver(newV);
  const rule = events ? '246' : '116';
  if (!vo || !vn) {
    if (breaking.length || additions.length) out.push({ level: 'error', rule, where: 'version', message: `cannot check the version bump: ${oldV} -> ${newV} is not MAJOR.MINOR.PATCH` });
    return { out, accepted: false };
  }
  if (cmp(vn, vo) < 0) out.push({ level: 'error', rule, where: 'version', message: `version went down from ${oldV} to ${newV}` });
  const major = vn[0] > vo[0];
  const minor = major || (vn[0] === vo[0] && vn[1] > vo[1]);
  let accepted = false;
  if (breaking.length) {
    if (events && mode !== 'none') {
      out.push({ level: 'error', rule: '209', where: 'compatibility_mode', message: `${breaking.length} incompatible change(s) are not allowed with compatibility_mode ${mode ?? 'forward'}` });
    } else if (vo[0] === 0 ? minor : major) accepted = true;
    else out.push({ level: 'error', rule, where: 'version', message: `${breaking.length} breaking change(s) need a ${vo[0] === 0 ? 'MINOR' : 'MAJOR'} version bump, aligned with all consumers (${oldV} -> ${newV})` });
  } else if (additions.length && !minor) {
    out.push({ level: 'error', rule, where: 'version', message: `${additions.length} compatible addition(s) need a MINOR version bump (${oldV} -> ${newV})` });
  }
  return { out, accepted };
}

export function specFindings(oldDoc, newDoc, { today }) {
  const changes = compareSpecs(oldDoc, newDoc);
  const { out: versions, accepted } = versionFindings(changes, oldDoc?.info?.version, newDoc?.info?.version);
  const stable = (semver(oldDoc?.info?.version)?.[0] ?? 1) > 0;
  const findings = [];
  for (const ch of changes) {
    if (ch.kind === BREAKING) findings.push({ level: accepted ? 'warn' : 'error', rule: '106', where: ch.where, dir: ch.dir, message: `${ch.message}${accepted ? ' (accepted by the version bump: consumers must be aligned)' : ''}` });
    else if (ch.review) findings.push({ level: 'warn', rule: '106', where: ch.where, dir: ch.dir, message: ch.message });
    else findings.push({ level: 'info', rule: ch.kind === ADDITION ? '107' : '106', where: ch.where, dir: ch.dir, message: ch.message });
  }
  findings.push(...removalFindings(changes, today, stable), ...versions);
  const ido = oldDoc?.info?.['x-api-id'];
  const idn = newDoc?.info?.['x-api-id'];
  if (ido && idn && ido !== idn) findings.push({ level: 'error', rule: '215', where: 'info.x-api-id', message: `the API identifier changed from ${ido} to ${idn}; it is immutable` });
  return findings;
}

// --- event types ----------------------------------------------------------------------------------------
const eventSchema = (et) => {
  const s = et?.schema?.schema;
  if (typeof s === 'string') return JSON.parse(s);
  return isObj(s) ? s : {};
};

export function eventFindings(oldEt, newEt) {
  const findings = [];
  for (const k of ['name', 'category']) {
    if (oldEt?.[k] !== newEt?.[k]) findings.push({ level: 'error', rule: k === 'name' ? '213' : '198', where: k, message: `${k} changed from ${oldEt?.[k]} to ${newEt?.[k]}; that is a new event type` });
  }
  for (const k of ['compatibility_mode', 'partition_strategy', 'partition_key_fields', 'ordering_key_fields', 'ordering_instance_ids']) {
    if (JSON.stringify(oldEt?.[k]) !== JSON.stringify(newEt?.[k])) findings.push({ level: 'warn', rule: k === 'compatibility_mode' ? '245' : '203', where: k, message: `${k} changed; tell the consumers first` });
  }
  const os = eventSchema(oldEt);
  const ns = eventSchema(newEt);
  const c = new SchemaComparison(os, ns);
  c.run(os, ns, 'event', 'event');
  const mode = newEt?.compatibility_mode ?? 'forward';
  const { out: versions } = versionFindings(c.changes, oldEt?.schema?.version, newEt?.schema?.version, { events: true, mode });
  for (const ch of c.changes) {
    findings.push({ level: ch.kind === BREAKING ? (mode === 'none' ? 'warn' : 'error') : ch.review ? 'warn' : 'info', rule: ch.kind === BREAKING ? '209' : '246', where: ch.where, message: ch.message });
  }
  return [...findings, ...versions];
}

// --- output -------------------------------------------------------------------------------------------
export function render(findings, format) {
  if (format === 'json') return JSON.stringify(findings, null, 2);
  const order = { error: 0, warn: 1, info: 2 };
  const lines = [...findings].sort((a, b) => order[a.level] - order[b.level]).map((f) => `${f.level.padEnd(5)} #${f.rule.padEnd(4)}${f.where}${f.dir ? ` (${f.dir})` : ''}: ${f.message}`);
  const count = (l) => findings.filter((f) => f.level === l).length;
  lines.push(`${count('error')} error(s), ${count('warn')} warning(s), ${count('info')} other change(s)`);
  return lines.join('\n');
}

export function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    console.error(e.message);
    return 2;
  }
  const today = args.today ?? new Date().toISOString().slice(0, 10);
  const baseText = readBase(args);
  if (baseText === undefined) {
    console.log(`No base version of ${args.file} at ${args.gitRef}: nothing to compare.`);
    return 0;
  }
  const oldDoc = parse(baseText);
  const newDoc = parse(fs.readFileSync(args.file, 'utf8'));
  const findings = args.events ? eventFindings(oldDoc, newDoc) : specFindings(oldDoc, newDoc, { today });
  console.log(render(findings, args.format));
  return findings.some((f) => f.level === 'error') ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
