import { operations, parameters, responses, headers, isSuccessCode, finding } from '../lib/oas.js';

const SKIP = new Set(['example', 'examples', 'default', 'enum', 'const', 'x-extensible-enum']);

function* deprecatedNodes(doc) {
  const stack = [{ node: doc, at: [] }];
  const seen = new Set();
  while (stack.length) {
    const { node, at } = stack.pop();
    if (node === null || typeof node !== 'object' || seen.has(node)) continue;
    seen.add(node);
    if (node.deprecated === true || node['x-sunset'] !== undefined) yield { node, at };
    for (const [k, v] of Object.entries(node)) if (v && typeof v === 'object' && !SKIP.has(k)) stack.push({ node: v, at: [...at, k] });
  }
}

const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2}))?$/.test(v) && !Number.isNaN(Date.parse(v));

// #187: deprecation is in the spec: deprecated: true, explained in the description; x-sunset is a date.
export function deprecationDocumented(doc) {
  const out = [];
  for (const { node, at } of deprecatedNodes(doc)) {
    if (node.deprecated === true && (typeof node.description !== 'string' || !node.description.trim())) {
      out.push(finding('Explain the deprecation in the description: why, what to use instead, how to migrate, the sunset date', at));
    }
    if (node['x-sunset'] !== undefined && !isDate(node['x-sunset'])) out.push(finding('x-sunset must be a date (YYYY-MM-DD)', [...at, 'x-sunset']));
  }
  return out;
}

// #189: responses of deprecated elements carry Deprecation (and Sunset when planned).
export function deprecationHeaders(doc) {
  const out = [];
  for (const op of operations(doc)) {
    const deprecated = op.op.deprecated === true || parameters(doc, op).some((p) => p.param.deprecated === true);
    if (!deprecated) continue;
    const sunset = op.op['x-sunset'] !== undefined;
    for (const r of responses(doc, op)) {
      if (!isSuccessCode(r.code)) continue;
      const names = new Set([...headers(doc, r.response, r.at)].map((h) => h.name.toLowerCase()));
      const missing = ['Deprecation', ...(sunset ? ['Sunset'] : [])].filter((h) => !names.has(h.toLowerCase()));
      if (missing.length) out.push(finding(`${op.method.toUpperCase()} ${op.path} is deprecated: declare the ${missing.join(' and ')} response header`, r.refAt));
    }
  }
  return out;
}
