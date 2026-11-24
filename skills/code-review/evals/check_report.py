"""Check a code-review report against a repository's pitfalls.md.

Usage: check_report.py REPORT [PITFALLS] EXPECTED_JSON
EXPECTED_JSON holds {"hit": [ids the diff hits]}; PITFALLS is omitted for a repository without the file.
"""
import json
import re
import sys

ID = re.compile(r"P\d+")


def parse_pitfalls(text):
    return re.findall(r"^\s*[-*]?\s*(P\d+)\b", text, re.M)


def _line_ids(report, label):
    m = re.search(rf"^{label}:(.*)$", report, re.M)
    return None if m is None else ID.findall(m.group(1))


def check_report(report, ids, hits):
    checked = _line_ids(report, "Pitfalls checked")
    hit = _line_ids(report, "Pitfalls hit")
    if not ids:
        if checked is not None or hit is not None:
            return ["report has pitfall lines but the repository has no pitfalls.md"]
        return []
    if checked is None or hit is None:
        return ["report lacks a 'Pitfalls checked:' or 'Pitfalls hit:' line"]
    errors = [f"{i} not listed as checked" for i in ids if i not in checked]
    errors += [f"{i} is hit but not reported" for i in hits if i not in hit]
    errors += [f"{i} reported as hit but is not" for i in hit if i not in hits]
    return errors


if __name__ == "__main__":
    args = sys.argv[1:]
    report = open(args[0]).read()
    ids = parse_pitfalls(open(args[1]).read()) if len(args) == 3 else []
    hits = json.load(open(args[-1]))["hit"]
    errors = check_report(report, ids, hits)
    print("\n".join(errors) or "ok")
    sys.exit(1 if errors else 0)
