# Report
- P0: ran scan_port_types.py (no violations). Found problems 3 and 4 (find_by has no page request and takes a generic dict criteria). RESULT.json: violations [], problems [3,4], applies true.
- P3: the touched code is send_reminders, which called generic find_by. I added a need-named finder find_overdue_unpaid(today, PageRequest) to the port and to both adapters. It returns only status "placed" orders, so paid and draft orders are excluded. The database pages the results (LIMIT/OFFSET). send_reminders now loops over pages.
- Added src/core/paging.py (PageRequest) and contract tests for the finder (both adapters) plus a caller test for paid/draft.
- The generic find_by stays because draft_cleanup (untouched) still calls it, so step 3 removed nothing.
- run_check.py: direction check and 17 tests pass.
- Not done: P1 and P2 were not requested.
