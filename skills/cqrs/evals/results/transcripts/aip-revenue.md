# Report
Steps: P0 (scan_query_imports.py: no violations; problems 1 and 2 hold; applies true; RESULT.json written). P2: evidence is a measurement over budget (p95 2.4 s vs 300 ms) plus a history read.
Projection spec: table monthly_revenue_projection (month, revenue_cents, invoices). Trigger: same transaction (PgInvoiceRepository.add/save), so finance sees issue/void immediately (no async, no outbox, no read-your-own-writes gap). Staleness: none. Idempotency: the void/unvoid transition is guarded in SQL (UPDATE ... WHERE voided <> new), so a repeated save changes nothing. Rebuild: python3 -m src.rebuild_revenue_projection (creates the table if missing, so run it once on the existing database).
Changed: schema.sql, src/adapters/pg_invoices.py, src/queries/monthly_revenue.py (reads the projection), src/rebuild_revenue_projection.py, tests/test_monthly_revenue.py (double-void, rebuild equals incremental), PROJECTION.json.
Checks (run_check.py): direction ok, 7 tests pass.
Caveat: the projection counts invoices dated after "today" within the current month (the old query excluded them); not measured against production data.
