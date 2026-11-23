import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { lint, good, codes, root } from './helpers.mjs';
import * as checks from '../ruleset/functions/checks/index.js';

const S = (d, name) => d.components.schemas[name];
const P = (d, name) => d.components.schemas[name].properties;
const list = (d) => d.paths['/sales-orders'].get;
const create = (d) => d.paths['/sales-orders'].post;
const item = (d) => d.paths['/sales-orders/{sales-order-id}'];
const problem = { $ref: '#/components/responses/Problem' };
const ok = (schema = { $ref: '#/components/schemas/SalesOrder' }) => ({ description: 'The result.', content: { 'application/json': { schema } } });
const addPath = (d, p, method = 'get', operation = { responses: { 200: ok(), default: problem } }) => {
  d.paths[p] = { ...(d.paths[p] ?? {}), [method]: operation };
};
const renamePath = (d, from, to) => {
  d.paths[to] = d.paths[from];
  delete d.paths[from];
};
const queryParam = (name, schema = { type: 'string', maxLength: 10 }) => ({ name, in: 'query', description: 'A query parameter.', schema });

// [rule, case, change to the compliant spec, options]. Options: absent (the rule must not fire),
// ruleset, source. A change may return a new document.
const CASES = [
  ['oas3-schema', 'a response without description', (d) => { delete item(d).delete.responses['204'].description; }],
  ['zalando-101-openapi-3', 'a Swagger 2.0 document', () => ({ swagger: '2.0', info: { title: 'x', version: '1.0.0' }, paths: {} })],
  ['zalando-101-yaml-file', 'a JSON file', () => {}, { source: 'openapi.json' }],
  ['zalando-234-durable-references', 'a reference to another file', (d) => { P(d, 'SalesOrder').grand_total = { $ref: './money.yaml#/Money' }; }],
  ['zalando-102-user-manual', 'no externalDocs', (d) => { delete d.externalDocs; }],
  ['zalando-103-us-english', 'a British spelling', (d) => { list(d).description = 'Lists the orders in the colour of their status.'; }],
  ['zalando-103-us-english', 'a German description', (d) => { list(d).description = 'Die Bestellungen werden mit dem Status und der Adresse für den Kunden zurückgegeben.'; }],
  ['zalando-103-us-english', 'a British property name', (d) => { P(d, 'SalesOrder').colour_code = { type: 'string', maxLength: 8 }; }],
  ['zalando-103-us-english', 'English with words that are also German', (d) => { list(d).description = 'Lists the orders that die in the queue, was it not for the den of thieves.'; }, { absent: true }],
  ['zalando-218-meta-information', 'no contact', (d) => { delete d.info.contact; }],
  ['zalando-116-semantic-version', 'a pre-release version', (d) => { d.info.version = '1.4.0-beta.1'; }],
  ['zalando-104-secure-endpoints', 'no security requirement', (d) => { delete d.security; }],
  ['zalando-104-secure-endpoints', 'an API key scheme', (d) => { d.components.securitySchemes.BearerAuth = { type: 'apiKey', in: 'header', name: 'Api-Key' }; }],
  ['zalando-104-secure-endpoints', 'an optional (empty) requirement', (d) => { list(d).security = [{}]; }],
  ['zalando-105-permissions', 'no scope', (d) => { d.security = [{ BearerAuth: [] }]; }],
  ['zalando-171-number-formats', 'an integer without format', (d) => { delete P(d, 'SalesOrder').item_count.format; }],
  ['zalando-171-number-formats', 'a number with an integer format', (d) => { P(d, 'Money').amount.format = 'int64'; }],
  ['zalando-238-standard-formats', 'a non-standard name for date-time', (d) => { P(d, 'SalesOrder').created_at.format = 'datetime'; }],
  ['zalando-238-standard-formats', 'an email without format', (d) => { P(d, 'SalesOrder').contact_email = { type: 'string', maxLength: 64 }; }],
  ['zalando-238-known-formats', 'an unknown format', (d) => { P(d, 'SalesOrder').customer_number.format = 'customer-number'; }],
  ['zalando-239-base64url', 'base64 content encoding', (d) => { P(d, 'SalesOrder').signature = { type: 'string', contentEncoding: 'base64' }; }],
  ['zalando-169-date-time-formats', 'a numeric timestamp', (d) => { P(d, 'SalesOrder').created_at = { type: 'integer', format: 'int64' }; }],
  ['zalando-169-date-time-formats', 'a lower-case z in an example', (d) => { P(d, 'SalesOrder').created_at.examples = ['2026-11-23T08:00:00z']; }],
  ['zalando-169-date-time-formats', 'a time property without format', (d) => { P(d, 'SalesOrder').pickup_time = { type: 'string', maxLength: 20 }; }],
  ['zalando-169-date-time-formats', 'a time zone property', (d) => { P(d, 'SalesOrder').time_zone = { type: 'string', format: 'tz-id' }; }, { absent: true }],
  ['zalando-255-appropriate-date-time', 'a date with format date-time', (d) => { P(d, 'SalesOrder').delivery_date.format = 'date-time'; }],
  ['zalando-255-appropriate-date-time', 'a local date-time without time zone', (d) => { P(d, 'SalesOrder').campaign_start_time = { type: 'string', format: 'date-time-local' }; }],
  ['zalando-127-durations', 'a numeric duration', (d) => { P(d, 'SalesOrder').processing_duration = { type: 'integer', format: 'int32' }; }],
  ['zalando-127-durations', 'a _before/_after pair', (d) => { list(d).parameters.push(queryParam('created_before', { type: 'string', format: 'date-time' }), queryParam('created_after', { type: 'string', format: 'date-time' })); }],
  ['zalando-170-code-formats', 'a country code without format', (d) => { delete P(d, 'Address').country_code.format; }],
  ['zalando-170-code-formats', 'a currency without format', (d) => { P(d, 'SalesOrder').payment_currency = { type: 'string', maxLength: 3 }; }],
  ['zalando-170-code-formats', 'a country name', (d) => { P(d, 'SalesOrder').country_name = { type: 'string', maxLength: 64 }; }, { absent: true }],
  ['zalando-170-code-formats', 'a programming language', (d) => { P(d, 'SalesOrder').language = { type: 'string', maxLength: 32, examples: ['Ruby'] }; }, { absent: true }],
  ['zalando-144-uuid-identifiers', 'an id with format uuid', (d) => { P(d, 'SalesOrder').id.format = 'uuid'; }],
  ['zalando-135-no-api-base-path', 'an /api path', (d) => { renamePath(d, '/sales-orders', '/api/sales-orders'); }],
  ['zalando-134-plural-resources', 'a singular resource', (d) => { renamePath(d, '/sales-orders', '/sales-order'); }],
  ['zalando-134-plural-resources', 'the self pseudo identifier', (d) => { addPath(d, '/customers/self'); addPath(d, '/customers'); }, { absent: true }],
  ['zalando-228-url-friendly-ids', 'a pattern that allows empty', (d) => { d.components.parameters.SalesOrderId.schema.pattern = '^.*$'; }],
  ['zalando-228-url-friendly-ids', 'an example with a space', (d) => { d.components.parameters.SalesOrderId.schema.example = 'so 1234'; }],
  ['zalando-129-kebab-case-segments', 'a camelCase segment', (d) => { renamePath(d, '/sales-orders', '/salesOrders'); }],
  ['zalando-136-normalized-paths', 'a trailing slash', (d) => { renamePath(d, '/sales-orders', '/sales-orders/'); }],
  ['zalando-141-verb-free-urls', 'a cancel action', (d) => { addPath(d, '/sales-orders/{sales-order-id}/cancel', 'post', { responses: { 204: { description: 'Cancelled.' }, default: problem } }); }],
  ['zalando-141-verb-free-urls', 'a noun that is also a verb, plural', (d) => { addPath(d, '/sales-orders/{sales-order-id}/processes'); }, { absent: true }],
  ['zalando-141-verb-free-urls', 'a verb before a singular object', (d) => { addPath(d, '/cancel-order'); }],
  ['zalando-141-verb-free-urls', 'a verb naming a kind of resource', (d) => { addPath(d, '/sales-orders/{sales-order-id}/export-jobs'); }, { absent: true }],
  ['zalando-142-domain-specific-names', 'a top-level items resource', (d) => { addPath(d, '/items'); }],
  ['zalando-143-resource-path-segments', 'a prefixed parameter', (d) => { addPath(d, '/sales-orders/order-{id}'); }],
  ['zalando-143-resource-path-segments', 'a path starting with a parameter', (d) => { addPath(d, '/{tenant}/sales-orders'); }],
  ['zalando-143-sub-paths', 'a sub-resource without its parent', (d) => { addPath(d, '/carts/{cart-id}/cart-items'); }],
  ['zalando-146-resource-types', 'nine resource types', (d) => { for (const r of ['carts', 'customers', 'invoices', 'shipments', 'returns', 'refunds', 'coupons', 'stocks']) addPath(d, `/${r}`); }],
  ['zalando-146-resource-types', 'one-to-one sub-resources count with their parent', (d) => { for (const r of ['carts', 'customers', 'invoices', 'shipments', 'returns', 'refunds', 'coupons']) { addPath(d, `/${r}`); addPath(d, `/${r}/{id}`); addPath(d, `/${r}/{id}/preferences`); } }, { absent: true }],
  ['zalando-147-sub-resource-levels', 'four sub-resource levels', (d) => { addPath(d, '/sales-orders/{a}/items/{b}/parts/{c}/notes/{d}/authors'); }],
  ['zalando-130-snake-case-query', 'a camelCase query parameter', (d) => { list(d).parameters.push(queryParam('sortOrder')); }],
  ['zalando-137-conventional-query', 'page_size instead of limit', (d) => { list(d).parameters.push(queryParam('page_size', { type: 'integer', format: 'int32' })); }],
  ['zalando-167-json-payload', 'only XML', (d) => { item(d).get.responses['200'] = { description: 'The order.', content: { 'application/xml': { schema: { $ref: '#/components/schemas/SalesOrder' } } } }; }],
  ['zalando-167-json-payload', 'a non-UTF-8 charset', (d) => { create(d).requestBody.content = { 'application/json; charset=iso-8859-1': create(d).requestBody.content['application/json'] }; }],
  ['zalando-167-json-object-request', 'an array request body', (d) => { create(d).requestBody.content['application/json'].schema = { type: 'array', items: { $ref: '#/components/schemas/SalesOrder' } }; }],
  ['zalando-252-single-read-write-schema', 'a create schema next to the resource schema', (d) => { d.components.schemas.CreateSalesOrder = S(d, 'SalesOrder'); }],
  ['zalando-172-standard-media-types', 'text/plain', (d) => { item(d).get.responses['200'].content['text/plain'] = { schema: { type: 'string' } }; }, { absent: true }],
  ['zalando-172-standard-media-types', 'a vendor media type', (d) => { item(d).get.responses['200'].content = { 'application/vnd.orders+json': item(d).get.responses['200'].content['application/json'] }; }],
  ['zalando-120-plural-array-names', 'a singular array name', (d) => { P(d, 'SalesOrder').tag = P(d, 'SalesOrder').tags; delete P(d, 'SalesOrder').tags; }],
  ['zalando-120-plural-array-names', 'a plural word before a qualifier', (d) => { P(d, 'SalesOrder').tag_ids_to_add = P(d, 'SalesOrder').tags; }, { absent: true }],
  ['zalando-118-snake-case-properties', 'a camelCase property', (d) => { P(d, 'SalesOrder').customerName = { type: 'string', maxLength: 64 }; }],
  ['zalando-240-upper-snake-enums', 'lower-case enum values', (d) => { P(d, 'SalesOrder').status = { type: 'string', enum: ['open', 'shipped'] }; }],
  ['zalando-240-upper-snake-enums', 'language codes', (d) => { P(d, 'SalesOrder').language = { type: 'string', format: 'iso-639-1', enum: ['en', 'de'] }; }, { absent: true }],
  ['zalando-235-date-time-names', 'a date-time without a date name', (d) => { P(d, 'SalesOrder').created = { type: 'string', format: 'date-time' }; }],
  ['zalando-216-maps', 'a map with properties', (d) => { P(d, 'SalesOrder').labels = { type: 'object', description: 'Keys are label names.', properties: { kind: { type: 'string', maxLength: 9 } }, additionalProperties: { type: 'string', maxLength: 9 } }; }],
  ['zalando-216-maps', 'a map without key description', (d) => { P(d, 'SalesOrder').labels = { type: 'object', additionalProperties: { type: 'string', maxLength: 9 } }; }],
  ['zalando-122-boolean-not-null', 'a nullable boolean', (d) => { P(d, 'SalesOrder').is_gift = { type: ['boolean', 'null'] }; }],
  ['zalando-122-boolean-not-null', 'a boolean or null through anyOf', (d) => { P(d, 'SalesOrder').is_gift = { anyOf: [{ type: 'boolean' }, { type: 'null' }] }; }],
  ['zalando-124-array-not-null', 'a nullable array', (d) => { P(d, 'SalesOrder').tags.type = ['array', 'null']; }],
  ['zalando-174-common-field-names', 'a numeric id', (d) => { P(d, 'SalesOrder').id = { type: 'integer', format: 'int64', readOnly: true }; }],
  ['zalando-174-common-field-names', 'a reference named _identifier', (d) => { P(d, 'SalesOrder').partner_identifier = { type: 'string', maxLength: 9 }; }],
  ['zalando-249-address-fields', 'postal_code instead of zip', (d) => { P(d, 'Address').postal_code = P(d, 'Address').zip; delete P(d, 'Address').zip; }],
  ['zalando-249-address-fields', 'surname instead of last_name', (d) => { P(d, 'SalesOrder').recipient = { type: 'object', properties: { first_name: { type: 'string', maxLength: 9 }, surname: { type: 'string', maxLength: 9 } } }; }],
  ['zalando-173-money-object', 'a bare price', (d) => { P(d, 'SalesOrder').shipping_price = { type: 'number', format: 'decimal' }; }],
  ['zalando-173-money-object', 'money with an extra amount', (d) => { P(d, 'Money').discounted_amount = { type: 'number', format: 'decimal' }; }],
  ['zalando-173-money-object', 'the amount inside Money', () => {}, { absent: true }],
  ['zalando-148-get-without-body', 'a GET with a body', (d) => { list(d).requestBody = create(d).requestBody; }],
  ['zalando-148-delete-without-body', 'a DELETE with a body', (d) => { item(d).delete.requestBody = create(d).requestBody; }],
  ['zalando-148-server-owned-ids', 'a client-provided id on POST', (d) => { delete P(d, 'SalesOrder').id.readOnly; }],
  ['zalando-148-patch-media-types', 'PATCH with application/json', (d) => { item(d).patch.requestBody.content = { 'application/json': item(d).patch.requestBody.content['application/merge-patch+json'] }; }],
  ['zalando-148-created-location', 'a 201 without body or Location', (d) => { create(d).responses['201'] = { description: 'Created.' }; }],
  ['zalando-154-collection-format', 'an array query parameter without style', (d) => { list(d).parameters.push(queryParam('tags', { type: 'array', items: { type: 'string', maxLength: 9 } })); }],
  ['zalando-243-official-status-codes', 'an unofficial code', (d) => { list(d).responses['299'] = ok(); }],
  ['zalando-151-success-and-error-responses', 'no error response', (d) => { delete list(d).responses.default; }],
  ['zalando-150-common-status-codes', '422', (d) => { create(d).responses['422'] = problem; }],
  ['zalando-150-status-code-methods', '201 on GET', (d) => { list(d).responses['201'] = ok(); }],
  ['zalando-150-undocumented-status-codes', 'a generic 404', (d) => { item(d).get.responses['404'] = { description: 'Not Found', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } }; }],
  ['zalando-150-undocumented-status-codes', 'a 404 with specific details', (d) => { item(d).get.responses['404'] = { description: 'No sales order with this id exists for the caller.', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } }; }, { absent: true }],
  ['zalando-220-specific-status-codes', 'a 200 without payload', (d) => { item(d).delete.responses = { 200: { description: 'Deleted.' }, default: problem }; }],
  ['zalando-220-specific-status-codes', 'a creating POST answering 200', (d) => { create(d).responses = { 200: ok(), default: problem }; }],
  ['zalando-152-batch-207', 'a batch POST without 207', (d) => { addPath(d, '/sales-order-batches', 'post', { requestBody: create(d).requestBody, responses: { 200: ok(), default: problem } }); }],
  ['zalando-153-rate-limit-headers', '429 without headers', (d) => { list(d).responses['429'] = { description: 'Too many requests for this tenant.', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } }; }],
  ['zalando-176-problem-json', 'an error as plain JSON', (d) => { d.components.responses.Problem.content = { 'application/json': d.components.responses.Problem.content['application/problem+json'] }; }],
  ['zalando-176-problem-schema', 'a string status', (d) => { P(d, 'Problem').status = { type: 'string' }; }],
  ['zalando-177-no-stack-traces', 'a stack_trace field', (d) => { P(d, 'Problem').stack_trace = { type: 'string' }; }],
  ['zalando-177-no-stack-traces', 'a stack field in the error payload', (d) => { P(d, 'Problem').stack = { type: 'string' }; }],
  ['zalando-177-no-stack-traces', 'a technology stack outside errors', (d) => { P(d, 'SalesOrder').stack = { type: 'string', maxLength: 9 }; }, { absent: true }],
  ['zalando-177-no-stack-traces', 'an example with a Java stack trace', (d) => { d.components.responses.Problem.content['application/problem+json'].example = { title: 'Boom', detail: 'java.lang.NullPointerException\n\tat com.shop.Orders.read(Orders.java:42)' }; }],
  ['zalando-251-no-redirects', 'a 301', (d) => { item(d).get.responses['301'] = { description: 'Moved to the new order location.' }; }],
  ['zalando-132-header-case', 'a lower-case header', (d) => { d.components.parameters.AcceptEncoding.name = 'accept-encoding'; }],
  ['zalando-178-content-headers', 'a Content-Type parameter', (d) => { create(d).parameters = [{ name: 'Content-Type', in: 'header', schema: { type: 'string', maxLength: 64 } }]; }],
  ['zalando-180-location-header', 'a Content-Location header', (d) => { create(d).responses['201'].headers = { 'Content-Location': { schema: { type: 'string', format: 'uri' } } }; }],
  ['zalando-183-proprietary-headers', 'a custom header', (d) => { list(d).parameters.push({ name: 'X-Order-Source', in: 'header', schema: { type: 'string', maxLength: 9 } }); }],
  ['zalando-183-proprietary-headers', 'X-Flow-ID', (d) => { list(d).parameters.push({ name: 'X-Flow-ID', in: 'header', schema: { type: 'string', maxLength: 128 } }); }, { absent: true }],
  ['zalando-164-hypertext-controls', 'a link as plain string', (d) => { P(d, 'SalesOrder').invoice_link = { type: 'string', format: 'uri' }; }],
  ['zalando-164-hypertext-controls', 'href without format', (d) => { delete P(d, 'HttpLink').href.format; }],
  ['zalando-165-simple-pagination-links', 'next as an object', (d) => { P(d, 'SalesOrderPage').next = { $ref: '#/components/schemas/HttpLink' }; }],
  ['zalando-217-absolute-uris', 'href as uri-reference', (d) => { P(d, 'HttpLink').href.format = 'uri-reference'; }],
  ['zalando-166-no-link-header', 'a Link header', (d) => { list(d).responses['200'].headers.Link = { schema: { type: 'string' } }; }],
  ['zalando-156-compression-headers', 'no Accept-Encoding', (d) => { list(d).parameters.pop(); }],
  ['zalando-157-fields-parameter', 'fields with a default', (d) => { item(d).get.parameters = [queryParam('fields', { type: 'string', maxLength: 99, default: '(id)' })]; }],
  ['zalando-227-cacheable-documented', 'an Expires header', (d) => { item(d).get.responses['200'].headers = { Expires: { schema: { type: 'string' } } }; }],
  ['zalando-227-cacheable-documented', 'Cache-Control without Vary and ETag', (d) => { item(d).get.responses['200'].headers = { 'Cache-Control': { schema: { type: 'string' } } }; }],
  ['zalando-159-pagination', 'a list without pagination', (d) => { list(d).parameters = [list(d).parameters[2]]; delete P(d, 'SalesOrderPage').next; }],
  ['zalando-159-pagination', 'an array on a single resource', (d) => { P(d, 'SalesOrder').tags = { type: 'array', items: { type: 'string', maxLength: 9 } }; }, { absent: true }],
  ['zalando-159-pagination', 'an array on a one-to-one sub-resource', (d) => { addPath(d, '/sales-orders/{sales-order-id}/preferences', 'get', { responses: { 200: ok({ type: 'object', properties: { channels: { type: 'array', items: { type: 'string', maxLength: 9 } } } }), default: problem } }); }, { absent: true }],
  ['zalando-160-cursor-pagination', 'offset', (d) => { list(d).parameters.push(queryParam('offset', { type: 'integer', format: 'int32' })); }],
  ['zalando-248-page-object', 'next_page instead of next', (d) => { P(d, 'SalesOrderPage').next_page = P(d, 'SalesOrderPage').next; delete P(d, 'SalesOrderPage').next; }],
  ['zalando-161-pagination-links', 'a bare cursor', (d) => { P(d, 'SalesOrderPage').next = { type: 'string', maxLength: 99 }; }],
  ['zalando-254-no-total-count', 'a total count', (d) => { P(d, 'SalesOrderPage').total_count = { type: 'integer', format: 'int64' }; }],
  ['zalando-109-conservative-input', 'an unconstrained input string', (d) => { delete P(d, 'SalesOrder').customer_number.maxLength; }],
  ['zalando-111-open-for-extension', 'additionalProperties: false', (d) => { S(d, 'Address').additionalProperties = false; }],
  ['zalando-113-avoid-versioning', 'a versioned media type', (d) => { item(d).get.responses['200'].content = { 'application/x.sales-order+json;version=2': item(d).get.responses['200'].content['application/json'] }; }],
  ['zalando-114-media-type-versioning', 'a version query parameter', (d) => { list(d).parameters.push(queryParam('api_version')); }],
  ['zalando-114-media-type-versioning', 'a malformed versioned media type', (d) => { item(d).get.responses['200'].content = { 'application/json;version=2': item(d).get.responses['200'].content['application/json'] }; }],
  ['zalando-115-no-url-versioning', 'a version in the path', (d) => { renamePath(d, '/sales-orders', '/v1/sales-orders'); }],
  ['zalando-115-no-url-versioning', 'a version in the server URL', (d) => { d.servers[0].url = 'https://sales-order.example.com/v2'; }],
  ['zalando-110-top-level-object', 'an array response', (d) => { list(d).responses['200'].content['application/json'].schema = { type: 'array', items: { $ref: '#/components/schemas/SalesOrder' } }; }],
  ['zalando-110-top-level-object', 'a map response', (d) => { item(d).get.responses['200'].content['application/json'].schema = { type: 'object', description: 'Keys are ids.', additionalProperties: { type: 'string' } }; }],
  ['zalando-112-extensible-enums', 'a closed enum', (d) => { P(d, 'SalesOrder').status = { type: 'string', enum: ['OPEN', 'SHIPPED'] }; }],
  ['zalando-187-deprecation-documented', 'a deprecated operation without description', (d) => { item(d).get.deprecated = true; item(d).get.responses['200'].headers = { Deprecation: { schema: { type: 'string' } } }; }],
  ['zalando-187-deprecation-documented', 'a malformed x-sunset', (d) => { item(d).get['x-sunset'] = 'next year'; }],
  ['zalando-189-deprecation-headers', 'a deprecated operation without Deprecation header', (d) => { item(d).get.deprecated = true; item(d).get.description = 'Deprecated: read orders from the order history API.'; }],
];

const internal = () => {
  const d = good();
  d.info['x-api-id'] = 'd0184f38-b98d-11e7-9c56-68f728c1ba70';
  d.info['x-audience'] = 'external-partner';
  d.servers = [{ url: 'https://order-sales-order.zalandoapis.com' }];
  const flow = { name: 'X-Flow-ID', in: 'header', schema: { type: 'string', maxLength: 128 } };
  for (const item of Object.values(d.paths)) for (const op of Object.values(item)) if (op && op.responses) op.parameters = [...(op.parameters ?? []), flow];
  return d;
};

const INTERNAL_CASES = [
  ['zalando-218-api-id-and-audience', 'no x-api-id', (d) => { delete d.info['x-api-id']; }],
  ['zalando-215-api-identifier', 'an invalid id', (d) => { d.info['x-api-id'] = 'Orders API'; }],
  ['zalando-219-api-audience', 'an unknown audience', (d) => { d.info['x-audience'] = 'public'; }],
  ['zalando-224-functional-hostnames', 'a non-functional external host', (d) => { d.servers[0].url = 'https://orders.example.com'; }],
  ['zalando-224-functional-hostnames', 'a legacy host for a company-internal API', (d) => { d.info['x-audience'] = 'company-internal'; d.servers[0].url = 'https://orders.team.zalan.do'; }],
  ['zalando-223-functional-naming', 'a company-internal API off functional naming', (d) => { d.info['x-audience'] = 'company-internal'; d.servers[0].url = 'https://orders.example.com'; }],
  ['zalando-225-permission-names', 'a colon in a scope', (d) => { d.security = [{ BearerAuth: ['orders:read'] }]; }],
  ['zalando-233-flow-id', 'an operation without X-Flow-ID', (d) => { list(d).parameters = list(d).parameters.filter((p) => p.name !== 'X-Flow-ID'); }],
  ['zalando-233-flow-id', 'a too short X-Flow-ID', (d) => { for (const p of list(d).parameters) if (p.name === 'X-Flow-ID') p.schema = { type: 'string', maxLength: 36 }; }],
];

test('the compliant spec has no findings', async () => {
  const results = await lint(good());
  assert.deepEqual(results, [], results.map((r) => `${r.code} ${r.path}: ${r.message}`).join('\n'));
});

test('the compliant spec passes the Zalando-internal rules', async () => {
  const results = await lint(internal(), { ruleset: 'zalando-internal.yaml' });
  assert.deepEqual(results, [], results.map((r) => `${r.code} ${r.path}: ${r.message}`).join('\n'));
});

const run = (cases, base, ruleset) => {
  for (const [code, name, change, opts = {}] of cases) {
    test(`${code}: ${name}${opts.absent ? ' (passes)' : ''}`, async () => {
      const d = base();
      const replaced = change(d);
      const results = await lint(replaced ?? d, { ruleset: opts.ruleset ?? ruleset, source: opts.source });
      const found = codes(results);
      if (opts.absent) assert.ok(!found.includes(code), `${code} fired: ${results.filter((r) => r.code === code).map((r) => r.message).join('; ')}`);
      else assert.ok(found.includes(code), `expected ${code}, got ${found.join(', ') || 'nothing'}`);
    });
  }
};

run(CASES, good, 'rest-api.yaml');
run(INTERNAL_CASES, internal, 'zalando-internal.yaml');

// Remote references would make Spectral fetch them, so these call the check directly.
const DIRECT = {
  'zalando-176-problem-reference': () => {
    const d = good();
    d.components.responses.Problem.content['application/problem+json'].schema = { $ref: 'https://zalando.github.io/problem/schema.yaml#/Problem' };
    assert.equal(checks.problemReference(d).length, 1);
    assert.equal(checks.problemSchema(d).length, 0);
  },
  'zalando-234-durable-references': () => {
    const d = good();
    P(d, 'SalesOrder').grand_total = { $ref: 'https://opensource.zalando.com/restful-api-guidelines/models/money-1.0.0.yaml#/Money' };
    P(d, 'SalesOrder').net_total = { $ref: 'https://raw.githubusercontent.com/acme/apis/0123456789abcdef0123456789abcdef01234567/money.yaml#/Money' };
    assert.equal(checks.durableReferences(d).length, 0);
    P(d, 'SalesOrder').tax_total = { $ref: 'https://raw.githubusercontent.com/acme/apis/main/money.yaml#/Money' };
    assert.equal(checks.durableReferences(d).length, 1);
  },
};

for (const [code, fn] of Object.entries(DIRECT)) test(`${code}: called directly`, fn);

test('every rule has a failing case', () => {
  for (const [file, cases] of [['rest-api.yaml', CASES], ['zalando-internal.yaml', INTERNAL_CASES]]) {
    const rules = Object.keys(YAML.parse(fs.readFileSync(path.join(root, 'ruleset', file), 'utf8')).rules);
    const tested = new Set([...cases.filter((c) => !c[3]?.absent).map((c) => c[0]), ...Object.keys(DIRECT)]);
    assert.deepEqual(rules.filter((r) => !tested.has(r)), [], `${file}: rules without a failing case`);
  }
});
