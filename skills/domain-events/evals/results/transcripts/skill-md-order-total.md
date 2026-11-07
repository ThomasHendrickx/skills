# P0 report
- Read skill SKILL.md (no scripts in skill folder), TASK.md, COMPANION.md.
- P0.1: no script provided; grepped paths.domain (src/sales/core, src/shipping/core, incl. commands) for src.infra.bus/mail imports: none -> violations [].
- P0.2: task is a pricing change to Order.total_cents inside the sales context; no cross-context trigger, no out-of-DB side effect, no consumer/projection need, no redelivery concern -> problems [].
- P0.3: no problems -> stop. applies=false. Wrote repo/RESULT.json only; no code changed.
