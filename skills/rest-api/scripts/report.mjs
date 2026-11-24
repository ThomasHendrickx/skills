#!/usr/bin/env node
// Writes one HTML page with the lint findings of a spec, placed on the API: each finding is shown at its
// endpoint and the part of it (parameter, request body, response, property), and a finding in a shared
// component lists every endpoint that uses it. Sorted by impact: MUST before SHOULD, then the number of
// endpoints affected, then the guideline number. The same spec and skill version give the same page.
//
//   node report.mjs <spec> [-o report.html]     lints with the repo's .spectral.yaml
//   node report.mjs <spec> --results lint.json  uses Spectral JSON results made before
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { isObj, deref, METHODS } from '../ruleset/functions/lib/oas.js';

const GUIDE = 'https://opensource.zalando.com/restful-api-guidelines/#';
const LEVEL = ['MUST', 'SHOULD', 'INFO', 'HINT'];

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '-o' || argv[i] === '--output') args.output = argv[(i += 1)];
    else if (argv[i] === '--results') args.results = argv[(i += 1)];
    else if (!args.spec) args.spec = argv[i];
    else throw new Error('usage: report.mjs <spec> [-o report.html] [--results lint.json]');
  }
  if (!args.spec) throw new Error('usage: report.mjs <spec> [-o report.html] [--results lint.json]');
  return args;
}

function lint(spec) {
  const pkg = createRequire(import.meta.url).resolve('@stoplight/spectral-cli/package.json');
  const bin = path.join(path.dirname(pkg), JSON.parse(fs.readFileSync(pkg, 'utf8')).bin.spectral);
  const r = spawnSync(process.execPath, [bin, 'lint', spec, '-f', 'json', '--quiet'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const text = r.stdout.trim();
  if (!text.startsWith('[')) throw new Error(`Spectral gave no JSON results:\n${r.stdout}${r.stderr}`);
  return JSON.parse(text);
}

// --- which endpoints use which component -----------------------------------------------------------
const refTarget = (ref) => (typeof ref === 'string' && ref.startsWith('#/components/') ? ref.slice(2).split('/').slice(0, 3).join('/') : undefined);

function refsIn(node, out = new Set(), seen = new Set()) {
  if (node === null || typeof node !== 'object' || seen.has(node)) return out;
  seen.add(node);
  if (typeof node.$ref === 'string') {
    const t = refTarget(node.$ref);
    if (t) out.add(t);
  }
  for (const v of Object.values(node)) refsIn(v, out, seen);
  return out;
}

export function usage(doc) {
  const direct = new Map();
  const components = isObj(doc.components) ? doc.components : {};
  for (const [kind, group] of Object.entries(components)) {
    if (!isObj(group)) continue;
    for (const [name, node] of Object.entries(group)) direct.set(`components/${kind}/${name}`, refsIn(node));
  }
  const closure = (start) => {
    const all = new Set();
    const stack = [...start];
    while (stack.length) {
      const c = stack.pop();
      if (all.has(c)) continue;
      all.add(c);
      for (const d of direct.get(c) ?? []) stack.push(d);
    }
    return all;
  };
  const used = new Map();
  const vias = new Map();
  for (const [p, item] of Object.entries(isObj(doc.paths) ? doc.paths : {})) {
    if (!isObj(item)) continue;
    for (const m of METHODS) {
      const op = item[m];
      if (!isObj(op)) continue;
      const endpoint = `${m.toUpperCase()} ${p}`;
      const entries = [['parameters', [...(item.parameters ?? []), ...(op.parameters ?? [])]], ['request body', op.requestBody]];
      for (const [code, r] of Object.entries(isObj(op.responses) ? op.responses : {})) entries.push([`response ${code}`, r]);
      for (const [via, node] of entries) {
        for (const c of closure([...refsIn(node)])) {
          if (!used.has(c)) used.set(c, []);
          if (!used.get(c).includes(endpoint)) used.get(c).push(endpoint);
          const k = `${c}|${endpoint}`;
          if (!vias.has(k)) vias.set(k, []);
          vias.get(k).push(via);
        }
      }
    }
  }
  used.via = (component, endpoint) => vias.get(`${component}|${endpoint}`) ?? [];
  return used;
}

// --- where a finding sits ----------------------------------------------------------------------------
function propertyPath(segs) {
  const out = [];
  for (let i = 0; i < segs.length; i += 1) {
    const s = segs[i];
    if (s === 'properties' && i + 1 < segs.length) out.push(String(segs[(i += 1)]));
    else if (s === 'items') out.push('[]');
    else if (s === 'additionalProperties') out.push('*');
  }
  return out.join('.').replace(/\.\[\]/g, '[]');
}

function partOf(container, segs, root) {
  const [kind, a, b, ...rest] = segs;
  if (kind === 'parameters') {
    const p = deref(root, container?.parameters?.[a]).node;
    return `parameter ${isObj(p) && p.name ? p.name : a}`;
  }
  if (kind === 'requestBody') {
    const prop = propertyPath(segs.slice(3));
    return `request body${prop ? ` › ${prop}` : ''}`;
  }
  if (kind === 'responses') {
    if (b === 'headers') return `response ${a} › header ${rest[0] ?? ''}`.trim();
    const prop = b === 'content' ? propertyPath(rest.slice(1)) : '';
    return `response ${a ?? ''}${prop ? ` › ${prop}` : ''}`.trim();
  }
  if (kind === undefined) return 'operation';
  return kind;
}

export function locate(doc, segs, used) {
  if (segs[0] === 'paths' && segs.length >= 2) {
    const p = segs[1];
    const m = segs[2];
    if (METHODS.includes(m)) {
      const rest = segs.slice(3);
      const part = partOf(doc.paths[p][m], rest, doc);
      return { endpoints: [`${m.toUpperCase()} ${p}`], part };
    }
    const methods = METHODS.filter((x) => isObj(doc.paths?.[p]?.[x])).map((x) => `${x.toUpperCase()} ${p}`);
    return { endpoints: methods, part: segs[2] === 'parameters' ? partOf(doc.paths[p], segs.slice(2), doc) : 'path' };
  }
  if (segs[0] === 'components' && segs.length >= 3) {
    const key = `components/${segs[1]}/${segs[2]}`;
    const kind = { schemas: 'schema', parameters: 'parameter', responses: 'response', requestBodies: 'request body', headers: 'header', securitySchemes: 'security scheme' }[segs[1]] ?? segs[1];
    const prop = segs[1] === 'schemas' ? propertyPath(segs.slice(3)) : '';
    const endpoints = used.get(key) ?? [];
    const via = Object.fromEntries(endpoints.map((e) => [e, used.via(key, e)]));
    return { endpoints, part: `${kind} ${segs[2]}${prop ? ` › ${prop}` : ''}`, shared: true, via };
  }
  return { endpoints: [], part: segs.length ? segs.join('.') : 'document' };
}

// --- the model of the page -----------------------------------------------------------------------------
export function build(doc, results) {
  const used = usage(doc);
  const findings = results.map((r) => {
    const segs = r.path.map(String);
    const m = /^zalando-(\d+)-/.exec(String(r.code));
    return { code: String(r.code), rule: m?.[1], level: LEVEL[r.severity] ?? 'INFO', severity: r.severity, message: r.message, line: (r.range?.start?.line ?? 0) + 1, ...locate(doc, segs, used) };
  });
  const order = (a, b) => a.severity - b.severity || b.endpoints.length - a.endpoints.length || Number(a.rule ?? 999) - Number(b.rule ?? 999) || a.code.localeCompare(b.code) || a.part.localeCompare(b.part) || a.line - b.line;
  findings.sort(order);
  const rules = new Map();
  for (const f of findings) {
    if (!rules.has(f.code)) rules.set(f.code, { code: f.code, rule: f.rule, level: f.level, severity: f.severity, findings: [], endpoints: new Set() });
    const r = rules.get(f.code);
    r.findings.push(f);
    f.endpoints.forEach((e) => r.endpoints.add(e));
  }
  const byRule = [...rules.values()].sort((a, b) => a.severity - b.severity || b.endpoints.size - a.endpoints.size || b.findings.length - a.findings.length || Number(a.rule ?? 999) - Number(b.rule ?? 999));
  const endpointOrder = [];
  for (const [p, item] of Object.entries(isObj(doc.paths) ? doc.paths : {})) for (const m of METHODS) if (isObj(item?.[m])) endpointOrder.push(`${m.toUpperCase()} ${p}`);
  const byEndpoint = endpointOrder.map((e) => ({ endpoint: e, findings: findings.filter((f) => f.endpoints.includes(e)) })).filter((x) => x.findings.length);
  const general = findings.filter((f) => f.endpoints.length === 0);
  return { title: doc.info?.title ?? 'API', version: doc.info?.version ?? '', findings, byRule, byEndpoint, general, endpointCount: endpointOrder.length };
}

// --- HTML ------------------------------------------------------------------------------------------
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ruleLink = (f) => (f.rule ? `<a href="${GUIDE}${f.rule}" target="_blank" rel="noopener">#${f.rule}</a>` : esc(f.code));
const badge = (level) => `<span class="lvl ${level}">${level}</span>`;
const count = (list, level) => list.filter((f) => f.level === level).length;

function findingRow(f, here) {
  const others = here ? f.endpoints.filter((e) => e !== here) : f.endpoints;
  const reach = f.shared && others.length ? `<div class="reach">${here ? `also in ${others.length} other endpoint${others.length > 1 ? 's' : ''}` : `${others.length} endpoint${others.length > 1 ? 's' : ''}`}: ${others.map(esc).join(', ')}</div>` : f.shared && !f.endpoints.length ? '<div class="reach">used by no endpoint</div>' : '';
  const where = here && f.via?.[here]?.length ? `${f.via[here].join(', ')} › ` : '';
  return `<li class="f" data-level="${f.level}">${badge(f.level)} ${ruleLink(f)} <span class="part">${esc(where + f.part)}</span><div class="msg">${esc(f.message)} <span class="line">line ${f.line}</span></div>${reach}</li>`;
}

export function render(model) {
  const { findings } = model;
  const affected = model.byEndpoint.length;
  const ruleSections = model.byRule.map((r) => `<details class="g" data-text="${esc(`${r.code} ${[...r.endpoints].join(' ')}`.toLowerCase())}"><summary>${badge(r.level)} ${ruleLink(r)} <b>${esc(r.code.replace(/^zalando-\d+-/, ''))}</b><span class="n">${r.findings.length} finding${r.findings.length > 1 ? 's' : ''} · ${r.endpoints.size} endpoint${r.endpoints.size === 1 ? '' : 's'}</span></summary><ul>${r.findings.map((f) => findingRow(f)).join('')}</ul></details>`).join('');
  const endpointSections = model.byEndpoint.map((e, i) => `<details class="g ep" data-order="${i}" data-count="${e.findings.length}" data-must="${count(e.findings, 'MUST')}" data-text="${esc(e.endpoint.toLowerCase())}"><summary><code>${esc(e.endpoint)}</code><span class="n">${count(e.findings, 'MUST')} MUST · ${count(e.findings, 'SHOULD')} SHOULD</span></summary><ul>${e.findings.map((f) => findingRow(f, e.endpoint)).join('')}</ul></details>`).join('');
  const general = model.general.length ? `<h2>Not tied to an endpoint</h2><ul class="plain">${model.general.map((f) => findingRow(f)).join('')}</ul>` : '';
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(model.title)} ${esc(model.version)}: API guideline report</title>
<style>
:root{--fg:#1d2433;--muted:#5f6b7a;--line:#e3e7ee;--bg:#f7f8fa;--must:#b42318;--should:#b54708;--info:#475467}
*{box-sizing:border-box}body{margin:0;font:14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;color:var(--fg);background:var(--bg)}
main{max-width:1100px;margin:0 auto;padding:24px}h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 10px}
.sum{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0}.card{background:#fff;border:1px solid var(--line);border-radius:8px;padding:12px 16px;min-width:150px}
.card b{display:block;font-size:22px}.bar{position:sticky;top:0;background:var(--bg);padding:10px 0;display:flex;gap:16px;align-items:center;flex-wrap:wrap;border-bottom:1px solid var(--line);z-index:1}
input[type=search]{padding:6px 10px;border:1px solid var(--line);border-radius:6px;min-width:260px}
details.g{background:#fff;border:1px solid var(--line);border-radius:8px;margin:6px 0}summary{cursor:pointer;padding:9px 12px;display:flex;gap:8px;align-items:center}
summary .n{margin-left:auto;color:var(--muted);white-space:nowrap}ul{list-style:none;margin:0;padding:0 12px 10px}ul.plain{background:#fff;border:1px solid var(--line);border-radius:8px;padding:10px 12px}
li.f{padding:8px 0;border-top:1px solid var(--line)}li.f:first-child{border-top:0}.part{font-family:ui-monospace,Consolas,monospace;font-size:13px}
.msg{color:var(--fg);margin-top:2px}.line{color:var(--muted);font-size:12px;margin-left:6px}.reach{color:var(--muted);font-size:12px;margin-top:2px}
.lvl{font-size:11px;font-weight:700;padding:1px 6px;border-radius:4px;color:#fff}.lvl.MUST{background:var(--must)}.lvl.SHOULD{background:var(--should)}.lvl.INFO,.lvl.HINT{background:var(--info)}
a{color:#175cd3}code{font-size:13px}.hidden{display:none}
</style></head><body><main>
<h1>${esc(model.title)} <span style="color:var(--muted);font-weight:400">${esc(model.version)}</span></h1>
<div style="color:var(--muted)">Checked against the <a href="https://opensource.zalando.com/restful-api-guidelines/">Zalando RESTful API guidelines</a>. Rule numbers link to the guideline.</div>
<div class="sum"><div class="card"><b style="color:var(--must)">${count(findings, 'MUST')}</b>MUST errors</div><div class="card"><b style="color:var(--should)">${count(findings, 'SHOULD')}</b>SHOULD warnings</div><div class="card"><b>${affected} / ${model.endpointCount}</b>endpoints affected</div><div class="card"><b>${model.byRule.length}</b>rules broken</div></div>
<div class="bar"><label><input type="checkbox" id="must" checked> MUST</label><label><input type="checkbox" id="should" checked> SHOULD</label><input type="search" id="q" placeholder="Filter by path, method or rule"><label>Endpoints: <select id="sort"><option value="order">spec order</option><option value="count">most findings first</option></select></label></div>
<h2>By rule, most impact first</h2>${ruleSections || '<p>No findings.</p>'}
<h2>By endpoint</h2><div id="eps">${endpointSections || '<p>No findings.</p>'}</div>
${general}
</main><script>
const $=(id)=>document.getElementById(id);
function apply(){const show={MUST:$('must').checked,SHOULD:$('should').checked,INFO:true,HINT:true};const q=$('q').value.trim().toLowerCase();
document.querySelectorAll('li.f').forEach(li=>li.classList.toggle('hidden',!show[li.dataset.level]));
document.querySelectorAll('details.g').forEach(d=>{const any=[...d.querySelectorAll('li.f')].some(li=>!li.classList.contains('hidden'));d.classList.toggle('hidden',!any||(q&&!d.dataset.text.includes(q)))});}
function sort(){const box=$('eps');const eps=[...box.querySelectorAll('details.ep')];const by=$('sort').value;
eps.sort((a,b)=>by==='count'?(b.dataset.must-a.dataset.must)||(b.dataset.count-a.dataset.count)||(a.dataset.order-b.dataset.order):a.dataset.order-b.dataset.order).forEach(e=>box.appendChild(e));}
['must','should','q'].forEach(id=>$(id).addEventListener('input',apply));$('sort').addEventListener('change',sort);
</script></body></html>
`;
}

export function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    console.error(e.message);
    return 2;
  }
  const doc = YAML.parse(fs.readFileSync(args.spec, 'utf8'), { maxAliasCount: -1 });
  const results = args.results ? JSON.parse(fs.readFileSync(args.results, 'utf8')) : lint(args.spec);
  const model = build(doc, results);
  const output = args.output ?? `${args.spec.replace(/\.(ya?ml|json)$/i, '')}-report.html`;
  fs.writeFileSync(output, render(model));
  console.log(`${output}: ${count(model.findings, 'MUST')} MUST, ${count(model.findings, 'SHOULD')} SHOULD, ${model.byEndpoint.length} of ${model.endpointCount} endpoints affected`);
  return 0;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
