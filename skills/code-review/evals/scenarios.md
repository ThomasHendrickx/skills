# Scenarios

Run the review on `fixtures/<form>/change.diff` with the repository's files as in that folder, then feed the report to `check_report.py`.

1. Given a repository with `pitfalls.md`, when the diff is reviewed, then the report names every pitfall id it checked and every id the diff hits (`fixtures/with-pitfalls/expected.json`).
2. Given a repository without `pitfalls.md`, when the diff is reviewed, then the report holds no pitfall lines (`fixtures/without-pitfalls/expected.json`).
