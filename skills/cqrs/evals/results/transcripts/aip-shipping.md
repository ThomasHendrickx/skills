# Report

Steps: P0 (scan_query_imports: no violations; problem 3 holds, since the page needs Shipping's data; applies=true; RESULT.json written), then P2 (evidence: another context's data, and Shipping asked others to stop reading `shipments`).

Changed:
- schema.sql: `shipping_outbox` (Shipping's events) and `order_shipping_status` projection (trigger: outbox consumer; idempotency key: order_id + shipment version, older/equal events ignored; staleness: applied right after the command commits, retried by scheduled `process`, at most the schedule interval; rebuild: replay all events).
- src/shipping/adapters/pg.py: shipment add/save write an outbox event in the same transaction.
- src/projections/order_shipping.py: idempotent `process` and `rebuild`.
- src/main.py: create/dispatch_shipment apply pending events after commit (read-your-own-writes: a customer opening the page after the dispatch email sees "dispatched").
- src/queries/my_orders.py: joins the projection, no longer `shipments`.
- tests: query scenarios plus projection tests (rows, duplicate delivery, stale event, rebuild equals incremental).
- PROJECTION.json written.

Checks: direction check ok, 11 tests pass, P0 scan clean.
Not done: no backfill of shipments that existed before the outbox (no events exist for them; a one-off Shipping-side republish is needed before deploy). The scheduler for `process` is not configured.
