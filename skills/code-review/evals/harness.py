#!/usr/bin/env python3
"""Run the code-review fixtures through the skill with fresh agents (same shape as the other skills' harnesses).

  harness.py prepare WORK   build WORK/<form>/<fixture>/{repo,skill,PROMPT.md}
  harness.py check WORK     check each REPORT.md with check_report.py, print PASS, FAIL or NOT RUN

Forms: `with-instruction` is the skill as committed; `without-instruction` is the same skill with the
pitfalls sentence removed from SKILL.md. Fixtures: `with-pitfalls` and `without-pitfalls`. An agent
reviews each repo from its PROMPT.md; its final reply is saved as WORK/<form>/<fixture>/REPORT.md. A run without a
report is NOT RUN, never PASS. Expected: both fixtures PASS with the instruction; with-pitfalls FAILS
without it (the report lacks the pitfall lines), so removing the instruction is caught.
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

from check_report import check_report, parse_pitfalls

HERE = Path(__file__).resolve().parent
SKILL = HERE.parent
FIXTURES = HERE / "fixtures"
FORMS = ("with-instruction", "without-instruction")
FIXTURE_NAMES = ("with-pitfalls", "without-pitfalls")
INSTRUCTION = " When the repo has a `pitfalls.md`, read `references/pitfalls.md` and report against it."
PROMPT = """Review the change in {repo}: the branch `change` against `main`, as `git diff main...HEAD`. Apply the skill in {skill}/SKILL.md, in this one session (no subagents). The repository has no issue or spec, so skip the acceptance-criteria axis and say so; run the Standards axis. Run commands from {repo}.

Give the review report as your final reply, nothing else after it; the runner saves it as {run}/REPORT.md. Read only the repo and the skill; do not read any other run directory or any check script.
"""


def strip_instruction(text):
    if INSTRUCTION not in text:
        raise ValueError("pitfalls instruction not found in SKILL.md")
    return text.replace(INSTRUCTION, "")


def _git(repo, *args):
    subprocess.run(["git", "-C", str(repo), "-c", "user.name=eval", "-c", "user.email=eval@example.invalid", *args],
                   check=True, capture_output=True)


def prepare(work):
    work = Path(work).resolve()
    for form in FORMS:
        for name in FIXTURE_NAMES:
            run = work / form / name
            if run.exists():
                shutil.rmtree(run)
            repo, skill = run / "repo", run / "skill"
            shutil.copytree(FIXTURES / "_shared", repo)
            subprocess.run(["git", "init", "-q", "-b", "main", str(repo)], check=True)
            if (FIXTURES / name / "pitfalls.md").exists():
                shutil.copy(FIXTURES / name / "pitfalls.md", repo / "pitfalls.md")
            _git(repo, "add", "-A")
            _git(repo, "commit", "-qm", "base")
            _git(repo, "checkout", "-q", "-b", "change")
            subprocess.run(["git", "-C", str(repo), "apply", str(FIXTURES / name / "change.diff")], check=True)
            _git(repo, "commit", "-qam", "change")
            shutil.copytree(SKILL, skill, ignore=shutil.ignore_patterns("evals", "__pycache__"))
            if form == "without-instruction":
                md = skill / "SKILL.md"
                md.write_text(strip_instruction(md.read_text()))
            (run / "PROMPT.md").write_text(PROMPT.format(repo=repo, skill=skill, run=run))
    print(f"Prepared {work}")


def check(work):
    work = Path(work)
    rows = []
    for form in FORMS:
        for name in FIXTURE_NAMES:
            run = work / form / name
            report = run / "REPORT.md"
            if not report.exists():
                rows.append((form, name, "NOT RUN", ""))
                continue
            pit = run / "repo" / "pitfalls.md"
            ids = parse_pitfalls(pit.read_text()) if pit.exists() else []
            hits = json.loads((FIXTURES / name / "expected.json").read_text())["hit"]
            errors = check_report(report.read_text(), ids, hits)
            rows.append((form, name, "FAIL" if errors else "PASS", "; ".join(errors)))
    return rows


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] not in ("prepare", "check"):
        sys.exit(__doc__)
    if sys.argv[1] == "prepare":
        prepare(sys.argv[2])
    else:
        for r in check(sys.argv[2]):
            print(f"{r[0]:20} {r[1]:18} {r[2]:8} {r[3]}")
