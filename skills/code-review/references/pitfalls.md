# Pitfalls file

A repository may keep `pitfalls.md` at its root or in `docs/`, with one numbered entry per line. Start with `P<n>: <the mistake> (<source issue or PR>)`, optionally followed by a scope and then a state.

```text
P7: Writes to the store outside a transaction (#212) (paths: src/store/; for: implementor, reviewer)
P9: Uses a fixed port in end-to-end tests (#240) [fixed: #251]
P12: Skips error handling on retry (#260) (paths: src/retry.py; for: reviewer) [fixed: #274]
```

- The scope suffix `(paths: …; for: roles)` uses comma-separated lists. A path ending in `/` matches that directory prefix. An omitted `paths:` or `for:` matches all paths or all roles, respectively.
- A line with no state suffix is live. Add `[fixed: <PR>]` once the fix has merged. Fixed entries remain eligible for review so a repeat can be reported.
- Delete retired lines. Never assign their numbers to new pitfalls. If the same pitfall returns, restore its original number.

Read every entry before the Standards axis. Check each against the diff, and report:

```
Pitfalls checked: P1, P2, P3
Pitfalls hit: P2 (src/sync.py, retry loop), P3 (src/sync.py, is_expired)
```

- List every id from the file under checked, not only the ones that matter; a hit also lists file and hunk, or `none`.
- A hit is a breach of a documented rule: blocking.
- Without a pitfalls file, write neither line.
