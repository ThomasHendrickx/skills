# Pitfalls file

A repository may keep `pitfalls.md` at its root or in `docs/`: one numbered entry per line, `P<n>: <the mistake> (<issue or PR it came from>)`. Numbers are never reused.

Read every entry before the Standards axis. Check each against the diff, and report:

```
Pitfalls checked: P1, P2, P3
Pitfalls hit: P2 (src/sync.py, retry loop), P3 (src/sync.py, is_expired)
```

- List every id from the file under checked, not only the ones that matter; a hit also lists file and hunk, or `none`.
- A hit is a breach of a documented rule: blocking.
- Without a pitfalls file, write neither line.
