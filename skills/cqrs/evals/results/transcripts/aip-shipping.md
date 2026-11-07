# Agent report

Steps run:
- P0: scan_query_imports.py gave no violations. Problem 3 holds: the page reads Shipping's `shipments` table, another context's data. applies = true. RESULT.json is written.
- P2 (evidence: another context's data; no measurement recorded):
  - Added the `order_shipping` projection table, `order_shipping_processed` (event ids) and `shipping_outbox` to schema.sql. Added `shipments.version`.
  - Shipping's `dispatch_shipment` writes a `ShipmentDispatched.v1` integration event to `shipping_outbox` in its own transaction. The event carries shipment_id, order_id, version, carrier and dispatched_on.
  - New relay `src/shipping/adapters/relay.py`: at-least-once delivery after commit, retry, dead-letter after 5 attempts with an error-log alert.
  - New consumer `src/projections/order_shipping.py`: records the event id in the effect's transaction and ignores older shipment versions. `rebuild` replays the retained outbox. `process` runs the relay.
  - `my_orders` now reads `order_shipping` instead of `shipments`; no row means 'pending'.
  - `main.dispatch_shipment` runs the relay right after commit. This is the read-your-own-writes strategy: the projection is current before the dispatch email goes out. Staleness bound: one relay run.
  - Tests in tests/test_order_shipping_projection.py: dispatch updates the page, redelivery applies once, an older version is ignored, rebuild equals incremental, rollback writes no event, retry then dead-letter.
- Checks: the unit tests (9) pass, check_direction.py passes, and the scan shows no violations.

Not done:
- Shipments dispatched before this change have no outbox events, so the projection does not know them and the page shows them as pending. They need a one-off backfill that writes `ShipmentDispatched.v1` events for existing dispatched shipments (Shipping's side).
- The dispatch email sender does not exist in the repo, so the ordering guarantee is only the relay running inside `dispatch_shipment`.
