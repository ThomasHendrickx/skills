import { isObj, deref, operations, parameters, responses, mediaTypes, isJsonMediaType, objectView, typesOf, pathSegments, isParamSegment, finding } from '../lib/oas.js';

const isCollectionPath = (p) => {
  const segs = pathSegments(p);
  return segs.length > 0 && !isParamSegment(segs.at(-1)) && segs.at(-1) !== 'self';
};

// List responses: GET on a collection path whose 200 JSON body is an array, holds an array named items
// or after the resource, or has page fields. Other arrays (on a one-to-one sub-resource) do not count.
function* listResponses(doc) {
  for (const op of operations(doc)) {
    if (op.method !== 'get' || !isCollectionPath(op.path)) continue;
    const query = new Set(parameters(doc, op).filter((p) => p.param.in === 'query').map((p) => p.param.name));
    for (const r of responses(doc, op)) {
      if (r.code !== '200') continue;
      for (const m of mediaTypes(r.response, r.at)) {
        if (!isJsonMediaType(m.type) || !isObj(m.media.schema)) continue;
        const { node, path } = deref(doc, m.media.schema, [...m.at, 'schema']);
        if (!isObj(node)) continue;
        const view = objectView(doc, node);
        const resource = pathSegments(op.path).at(-1);
        const named = new Set(['items', resource.replace(/-/g, '_'), resource.split('-').at(-1)]);
        const arrays = Object.entries(view.properties).filter(([k, v]) => named.has(k) && typesOf(deref(doc, v).node).has('array')).map(([k]) => k);
        const paged = ['next', 'prev', 'first', 'last', 'cursor'].some((k) => k in view.properties);
        if (arrays.length || paged || typesOf(node).has('array')) yield { op, query, view, at: path, mediaAt: m.at, arrays };
      }
    }
  }
}

// #159: lists support pagination with limit plus cursor (or offset).
export function pagination(doc) {
  const out = [];
  for (const { op, query, view } of listResponses(doc)) {
    const paged = query.has('limit') && (query.has('cursor') || query.has('offset'));
    if (!paged && !('next' in view.properties)) out.push(finding(`GET ${op.path} returns a list: support pagination with limit and cursor (or offset)`, [...op.at, 'parameters']));
  }
  return dedupe(out);
}

// #160: cursor-based pagination rather than offset.
export function cursorPagination(doc) {
  const out = [];
  const seen = new Set();
  for (const op of operations(doc)) {
    for (const { param, at } of parameters(doc, op)) {
      if (param.in === 'query' && param.name === 'offset' && !seen.has(param)) {
        seen.add(param);
        out.push(finding('Prefer cursor-based pagination over offset', at));
      }
    }
  }
  return out;
}

const NON_STANDARD_PAGE = new Set(['next_page', 'next_cursor', 'next_link', 'next_page_token', 'next_token', 'nextpage', 'page_info', 'pagination', 'paging', 'page_token', 'previous', 'prev_page', 'previous_page', 'prev_cursor']);

// #248: the response page object: self, first, prev, next, last and the items.
export function pageObject(doc) {
  const out = [];
  for (const { op, query, view, at } of listResponses(doc)) {
    const paged = query.has('cursor') || query.has('offset') || query.has('limit');
    const odd = Object.keys(view.properties).filter((k) => NON_STANDARD_PAGE.has(k.toLowerCase()));
    if (odd.length) out.push(finding(`Use the page object fields self, first, prev, next, last instead of ${odd.join(', ')}`, at));
    else if (paged && !('next' in view.properties)) out.push(finding(`The page returned by GET ${op.path} should provide next (and prev, first, last, self)`, at));
  }
  return dedupe(out);
}

// #161: pagination fields as links (format uri) rather than bare cursors.
export function paginationLinks(doc) {
  const out = [];
  for (const { view, at } of listResponses(doc)) {
    for (const k of ['self', 'first', 'prev', 'next', 'last']) {
      if (!(k in view.properties)) continue;
      const { node } = deref(doc, view.properties[k]);
      if (typesOf(node).has('string') && node.format !== 'uri') out.push(finding(`"${k}" should be a pagination link (format uri) rather than a bare cursor`, at));
    }
  }
  return dedupe(out);
}

const TOTALS = new Set(['total', 'total_count', 'total_elements', 'total_items', 'total_results', 'total_pages', 'total_size', 'count', 'result_count', 'total_hits']);

// #254: no total result count in pages.
export function noTotalCount(doc) {
  const out = [];
  for (const { view, at } of listResponses(doc)) {
    for (const k of Object.keys(view.properties)) if (TOTALS.has(k)) out.push(finding(`Avoid the total count "${k}" in pages; offer it through Prefer: return=total-count if clients need it`, at));
  }
  return dedupe(out);
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((f) => {
    const k = f.path.join('\u0000') + f.message;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
