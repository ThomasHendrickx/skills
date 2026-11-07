# Report
- P0: scanned src/sales/core and src/shipping/core (incl. commands) for imports of src.infra.bus / src.infra.mail: none, so violations = [].
- Problems 1-4: none hold. No consumer exists ("No team has asked to subscribe yet"), and the questions from other teams are not a consumer polling or diffing tables. The skill's "Not needed when" says no consumer yet means publish nothing. applies = false, so I stopped after P0.
- P2 not run (it would stop at step 1 anyway: no consumer). No code changes made. Result in repo/RESULT.json.
- Note: recording an InvoicePaid event (domain-modelling) is optional and not requested here; docs/event-list.md has no such event.
