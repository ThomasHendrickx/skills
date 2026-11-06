# Report
- P0: parsed ports for sqlite3 types (none -> violations []); the task and port show problem 3 (unpaged list method). RESULT.json: {"violations": [], "problems": [3], "applies": true}.
- P3: generic call `find_by(where)` was used by `send_reminders` and `stale_draft_numbers`. Replaced with need-named, paged finders `find_overdue_unpaid(today, page)` and `find_stale_drafts(before, page)` (new `PageRequest` in src/core/page.py), implemented in both adapters (SQL LIMIT/OFFSET in sqlite). Removed `find_by` since no caller remained. Reminders now skip paid and draft orders (the bug fix); callers page through results.
- Contract tests extended and run against both adapters; added a reminders regression test. 17 tests pass; check_direction.py reports "direction ok".
- Not done: nothing outstanding.
