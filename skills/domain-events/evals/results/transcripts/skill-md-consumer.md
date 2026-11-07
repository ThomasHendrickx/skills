# Report
- P0: check_direction.py ok (no infra imports in core). Problem 4 (redelivery/reordering) applies -> RESULT.json {violations: [], problems: [4], applies: true}.
- P3: added tests first-class (duplicate, redelivery, refund-before-payment, retry, dead-letter); implemented:
  - schema.sql: processed_events, seen_invoice_versions, consumer_failures (retry state + dead-letter).
  - shipping core command apply_invoice_event: records event id and invoice version in the same transaction as the effect; duplicates and older versions are ignored.
  - worker: failed messages are recorded and retried with backoff (5 attempts), then dead-lettered with a CRITICAL log alert (alerted_at set); the offset no longer silently skips failures.
  - `python3 -m src.shipping.consumers.worker --ignore-wait` runs a pass as if waits had passed.
- Ran check_direction.py and the unit tests: all pass (12 tests).
- Not done: the alert is a log line plus alerted_at column (no alerting system exists in the repo); schema.sql changes are not migrated to any live database (tests reset from schema.sql). Did not touch Sales/relay (outside P3). docs/event-list.md unchanged (no new event).
