# Scenarios

Run `python3 harness.py prepare WORK`, then give each `WORK/<form>/<fixture>/PROMPT.md` to a fresh agent session; its final reply is saved as `REPORT.md`. `python3 harness.py check WORK` feeds each report to `check_report.py` and prints PASS, FAIL or NOT RUN. Each fixture runs with the skill as committed (`with-instruction`) and with the pitfalls sentence removed from SKILL.md (`without-instruction`).

1. Given a repository with `pitfalls.md`, when the diff is reviewed, then the report names every pitfall id it checked and every id the diff hits (`fixtures/with-pitfalls/expected.json`).
2. Given a repository without `pitfalls.md`, when the diff is reviewed, then the report holds no pitfall lines (`fixtures/without-pitfalls/expected.json`).
3. Given the skill without its pitfalls instruction, when the repository with `pitfalls.md` is reviewed, then the check FAILS (the report lacks the pitfall lines); so removing the instruction is caught.
