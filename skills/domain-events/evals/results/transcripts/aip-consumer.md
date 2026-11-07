# Agent report

Steps: read skill SKILL.md; P0 step 1 ran scan_infra_imports.py (no violations); P0 steps 2-3: problem 4 holds (redelivery, reordering, crash; applies true). Wrote RESULT.json first. P3: wrote consumer scenarios (tests/test_invoice_consumer.py), idempotent handler, retry and dead-letter, then ran run_check.py with checks.dependencyDirection and checks.eventTests (both pass, 12 tests).

Changes:
- schema.sql: processed_events, seen_invoice_versions, consumer_attempts, dead_letters.
- Shipping core command apply_invoice_event (records event id + invoice version in the same transaction as the effect; duplicates and older versions ignored); pg adapter PgProcessedEvents; wired in src/main.py.
- consumers/invoice_events.py rewritten to call it; worker.py retries a failing message on each pass (stops the pass to keep order), dead-letters after 3 attempts with an ERROR log alert, then moves on.
- docs/event-list.md note; CONSUMER.json written.

Not done / notes: the alert is a dead_letters row plus an error log, no external pager. Retries have no built-in wait (each pass is one attempt), so deliver is the plain worker command. P1/P2/P4 not run (task covers only the consumer; Sales side unchanged).
