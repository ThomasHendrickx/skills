# Report
- P0-1: ran scan_infra_imports.py on src/sales/core and src/shipping/core with infra modules src.infra.bus and src.infra.mail. No violations.
- P0-2: the task (store last payment date on the customer account when an invoice is paid) has none of problems 1-4. It has no cross-context or outside-system effect, no side effect before commit, no consumer reading another context's tables, and no redelivery concern.
- P0-3: the reaction is in the same context (sales) and the same transaction, so the skill says to stop and use an explicit call. applies=false.
- Stopped after P0, so P4 was not run. RESULT.json written: {"violations": [], "problems": [], "applies": false}.
- No repo code changed. The skill's guidance for the task is an explicit call in pay_invoice, not an event handler. src/sales/core/handlers.py currently dispatches credit_customer_account as an in-process handler. The existing send_payment_receipt mails before commit, which is outside the task's scope.
