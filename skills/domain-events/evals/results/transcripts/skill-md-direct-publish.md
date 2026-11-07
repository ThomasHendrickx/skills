# Report

Steps: P0 (scan of domain/use cases for infra imports; task check), then P4.

P0: violations = pay_invoice.py and cancel_invoice.py import src.infra.bus (rule 2); problems 1, 2; applies = true. Written to repo/RESULT.json. (The skill has no script files; the scan was done by hand/grep.)

P4: scope = the direct publish in pay_invoice only. cancel_invoice (rewritten by another team) is left untouched and still publishes directly.
- pay_invoice no longer imports or calls the bus; Invoice.pay records an InvoicePaid event (added to docs/event-list.md first and to sales/core/events.py).
- PgInvoiceRepository.save writes the event to a new sales_outbox table (schema.sql) in the same transaction, only after the version-checked update succeeds, so a stale save leaves no outbox row and no message.
- New relay src/sales/adapters/relay.py publishes unpublished rows after commit (at least once), same topic/payload so the shipping consumer is unchanged.
- Tests: outbox row on commit, none on rollback/stale save, relay publishes once; payment-notice test now runs the relay.
- Ran check_direction.py (ok) and the unittest suite (9 pass).

Not done: no production scheduler is wired to run the relay (call relay.run_once); relay has no retry loop/backoff beyond rerunning; the consumer idempotency and an integration-event contract (P2/P3) were out of scope. check_direction.py does not flag the `from src.infra import bus` form, so it passes while cancel_invoice still imports infra.
