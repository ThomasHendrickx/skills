# Scenario results

One run per fixture and form, by fresh Sonnet 5.5 subagents (`claude-sonnet-5-5`) following the form under test (`SKILL.md`, or `aip/` with its scripts), driven by `../harness.py` the way the repository and ports-and-adapters pilots were. Each run had its own database on a real Postgres 17 container (`harness.py postgres`, podman). Script scenarios are executable checks the harness ran on the finished repositories, against a fresh check database. S0.4 is read from the agent's own P0 output (`RESULT.json`). S1.2, S1.5, S2.3 and S4.1 were judged by one separate Sonnet 5.5 judge per form from the diff and the finished repository (`judge-skill-md.json`, `judge-aip.json`). A pass is a single observation, not a rate.

Evidence per run is in `transcripts/<form>-<run>.{prompt.md,md,diff}`: the exact prompt, the agent's own report and the repository diff. `check-output.md` is the raw `harness.py check` output, `results.json` the table as data. The compiler validation (`validate-aip.txt`, real `validate.py` output), the count check (`check-aip.txt`) and the scanner unit test (`scan-unit-test.txt`) are separate real runs.

| Scenario | SKILL.md | AIP | notes (SKILL.md / AIP) |
| --- | --- | --- | --- |
| S0.1 | PASS | PASS | applies=false, nothing added in `src/queries` / same |
| S0.2 | PASS | PASS | `src/queries/order_summary.py` in violations / same |
| S0.3 | PASS | PASS | `src/core/commands/cancel_order.py` in violations / same |
| S0.4 | PASS | PASS | problems 1, 3 / same |
| S1.1 | PASS | PASS | `customer_totals.py` with read types, no domain import, queryTests pass / same, wired through `src/main.py` |
| S1.2 | PASS | PASS | grouping, sums, HAVING, ORDER BY, LIMIT/OFFSET and count in SQL / same |
| S1.3 | PASS | PASS | no method added to any repository port or adapter / same |
| S1.4 | PASS | PASS | `order_edit_form.py` returns `OrderEditForm`, no new table / same |
| S1.5 | PASS | PASS | query reads the persisted `loyalty_tier`; the rule runs only in write commands / same |
| S2.1 | PASS | PASS | stopped at P0 (applies=false), no new table / same |
| S2.2 | PASS | PASS | query reads `monthly_revenue_projection`; report correct; second void and repeated processing leave rows equal; rebuild equals incremental / same |
| S2.3 | PASS | FAIL | trigger, staleness, idempotency key (invoice_id, change) and rebuild declared in `revenue_projection.py` / trigger and rebuild declared; no staleness bound or idempotency key declared |
| S2.4 | PASS | PASS | rerun after rule 7 became a pointer to `domain-events`: rolled-back dispatch changed no table; committed dispatch added a `shipping_outbox` row (and processed-event rows) / same, plus an `order_shipping` row |
| S3.1 | PASS | PASS | customer page uses a query, staff page unchanged, finder kept / same, wired through `src/main.py` |
| S4.1 | PASS | PASS | `change_shipping_address(order_id, street, city, postcode)` returns the version / same |
| S4.2 | PASS | PASS | `update_order` kept; the original UpdateOrder tests pass / same |

## Notes

- S2.4 was rerun on both forms after rule 7 (outbox) moved to `domain-events` and became a pointer; the AIP was recompiled first (`validate-aip.txt`, `check-aip.txt`). For that rerun the harness gives the agent `domain-events` in the same form under `skill/related/` (both agents read it), so the shipping prompt differs from the other runs by one sentence. Fresh Sonnet 5.5 subagents again; raw check output in `check-output-s2.4-rerun.md`, evidence in `transcripts/*-shipping.*`. The other rows are from the earlier runs, not rerun.
- S2.3 AIP fails: the AIP run's projection is same-transaction and correct (S2.2 passes), but it declares no staleness bound and no idempotency key, which rule 6 asks for. Reported as is.
- S2.1 passed on both forms by P0 stopping (applies=false: the level-1 query already exists and the measurement is under budget), not by P2 step 1. P2 step 1 was never reached, so the scenario's "When P2 runs" is only partly exercised.
- Both revenue runs chose a same-transaction trigger, and set `process` to null, so S2.2 tested "the same change applied twice" as a second void of the same invoice. Both shipping runs chose an outbox consumer, which is the async case S2.4 needs.
- The first `check` run (`check-output-first-harness.md`) failed S0.2/S0.3 on SKILL.md and S1.1/S3.1 on AIP because of two harness bugs, fixed before this table: violations written as "path imports x (rule n)" were not parsed to their path, and a page wired to the query through the composition root (`src/main.py`) was not counted as using it. No agent run was repeated.
- The SKILL.md form ships no scripts, so those agents did the P0 import scan by hand (their reports say so); the AIP agents ran `scan_query_imports.py`.
- S1.1 and S1.4 count a read type as a class the query module defines; the domain import check uses the P0 scanner. That is a heuristic of the harness, not of the spec.
- Beyond the tasks: the AIP totals and loyalty runs removed repository finders left without callers (P3 step 3 wording), and the AIP finder run persisted `orders.total_cents` on the write side. Not scored.
