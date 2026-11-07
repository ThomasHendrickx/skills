# Report

P0: no infra imports in core (violations []); problems 1 and 2 (cross-context reaction, publish must follow commit); applies true. Written to repo/RESULT.json.

P1: added InvoicePaid to docs/event-list.md; Invoice.pay records it (src/sales/core); invoice repo save writes it to new `sales_outbox` table (schema.sql) in the same transaction; relay in src/sales/adapters/relay.py (publishes after commit, retry with backoff, at least once), exposed as main.relay_sales_outbox. Tests added in tests/test_sales.py (commit -> one row, rollback/rejected -> none, no direct publish).

P2: consumer is Shipping (needs order id and paid date). Contract InvoicePaidV1 (topic sales.invoice-paid.v1) in src/contracts/sales.py: event_id, invoice_id, order_id, paid_on, invoice_version (id and version for dedupe/ordering; no state transfer). Relay maps internal event to contract; contract payload test added.

Checks: check_direction.py ok; unit tests 12 pass.
Not done: Shipping's consumer (belongs to Shipping, P3). The relay needs a scheduler to call main.relay_sales_outbox (none exists in the repo). InvoiceIssued/OrderPlaced are still not persisted (out of scope).
