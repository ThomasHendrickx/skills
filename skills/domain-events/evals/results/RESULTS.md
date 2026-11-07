# Scenario results

One run per fixture and form, by fresh Sonnet 5.5 subagents (`claude-sonnet-5-5`) following the form under test (`SKILL.md`, or `aip/` with its scripts), driven by `../harness.py` the way the cqrs and repository pilots were. Each run had its own database on a real Postgres 17 container (`harness.py postgres`, podman). Script scenarios are executable checks the harness ran on the finished repositories, each against a fresh check database. S0.2 and S0.3 are read from the agent's own P0 output (`RESULT.json`). S1.3, S2.2 and S4.2 were judged by one separate Sonnet 5.5 judge per form from the diff and the finished repository (`judge-skill-md.json`, `judge-aip.json`). A pass is a single observation, not a rate.

Evidence per run is in `transcripts/<form>-<run>.{prompt.md,md,diff}`: the exact prompt, the agent's own report and the repository diff. `check-output.md` is the raw `harness.py check` output, `results.json` the table as data. The compiler validation (`validate-aip.txt`, real `validate.py` output), the count check (`check-aip.txt`) and the scanner unit test (`scan-unit-test.txt`) are separate real runs. Before the agent runs, `check` was run on the unchanged fixtures: every script check failed there except S0.1, S1.2 and S2.3, which hold for a repository that did nothing.

| Scenario | SKILL.md | AIP | notes (SKILL.md / AIP) |
| --- | --- | --- | --- |
| S0.1 | PASS | PASS | applies=false, event list and events module unchanged / same |
| S0.2 | PASS | PASS | `pay_invoice.py` and `cancel_invoice.py` in violations (by hand) / same (scanner) |
| S0.3 | PASS | PASS | problems 1, 2 / problems 1, 3 |
| S1.1 | PASS | PASS | rolled-back payment changed no table; committed payment added one `sales_outbox` row / same |
| S1.2 | PASS | PASS | no domain or use case file imports the bus client / same |
| S1.3 | PASS | PASS | `InvoicePaid`, recorded by `Invoice.pay`, listed in `docs/event-list.md` / same |
| S2.1 | PASS | PASS | `src/contracts/sales.py` (`InvoicePaidV1`), no shipping import of sales / `src/contracts/invoice_paid.py` (`sales.invoice-paid.v1`), same |
| S2.2 | PASS | PASS | order id and date, plus invoice id, event id and invoice version, declared; no state carried / same |
| S2.3 | PASS | PASS | stopped at P0 (applies=false), no contract file / same |
| S3.1 | PASS | PASS | the same InvoicePaid delivered twice gives one fulfilment / same |
| S3.2 | PASS | PASS | InvoiceRefunded v3 before InvoicePaid v2 leaves no fulfilment requested / same |
| S3.3 | PASS | PASS | 5 attempts, then the message is in the dead-letter / 3 attempts, then the same |
| S4.1 | PASS | PASS | rolled-back payment changed no table; committed payment added one outbox row; `cancel_invoice.py` unchanged / same |
| S4.2 | FAIL | FAIL | stopped at P0 (applies=false); the in-process handler still updates the account / same |

## Notes

- S4.2 fails on both forms because P0 step 3 stops the run: both agents read the task (store the last payment date on the account when an invoice is paid) as a reaction in the same context and transaction, so "stop, explicit call", and never reached P4. Both reports name the explicit call in `pay_invoice` as the answer, but wrote no code, as the prompt says after applies=false. The fixture also mails a receipt from an in-process handler before commit (problem 2); both agents saw it and kept it out of scope as untouched by the task. The gate's first stop covers the case P4 step 2 handles ("same-transaction handler -> explicit call"), which starves this scenario (aip-skill-writing rule 3). Reported as is, not redesigned.
- S2.3 passed on both forms by P0 stopping (applies=false: no consumer, so no problem holds, as "Not needed when" says), not by P2 step 1. P2 step 1 was never reached, so the scenario's "When P2 runs" is only partly exercised.
- S2.2 is a lenient pass on both forms: both judges note that the payload carries `invoice_id`, `event_id` and a version beyond the order and date Shipping asked for, and passed it because those are ids and declared in the contract (rule 7: ids and the facts of the change).
- The SKILL.md form ships no scripts, so those agents did the P0 import scan by hand (grep or `check_direction.py`, as their reports say); the AIP agents ran `scan_infra_imports.py`.
- The AIP direct-publish agent says it wrote `RESULT.json` after the code changes, not before as the prompt asked; its P0 content is unaffected.
- S3.3 relies on the agent's `CONSUMER.json`: `deliver` ran 8 passes "as if any wait between attempts had passed" (the SKILL.md run added `--ignore-wait` to its backoff), and the declared `dead_letter` query had to return the failed message. S3.2's check accepts no fulfilment or a cancelled one; both runs left none.
- Beyond the tasks: no run scheduled its relay (each says something must call it); the AIP invoice-paid relay has no dead-letter for a row that always fails. Not scored.
