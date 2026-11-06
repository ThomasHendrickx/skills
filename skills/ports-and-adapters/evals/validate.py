#!/usr/bin/env python3
"""Structural checks for the approved scenarios in both skill forms."""
import json
import subprocess
import tempfile
from pathlib import Path


ROOT = Path(__file__).parents[1]
SOURCE = (ROOT / "SKILL.md").read_text()
AIP = (ROOT / "aip" / "SKILL.md").read_text()
SCENARIOS = (ROOT / "evals" / "scenarios.md").read_text()


def check(identifier, condition):
    if not condition:
        raise AssertionError(identifier)
    print(f"{identifier}: PASS")


def main():
    for identifier in ("S0.1", "S0.2", "S0.3", "S1.1", "S1.2", "S1.3", "S1.4", "S2.1", "S2.2", "S3.1", "S3.2", "S3.3"):
        check(identifier, identifier in SCENARIOS)

    check("source-anatomy", all(part in SOURCE for part in (
        "# Problem", "# Solution", "# Not needed when", "# Rules",
        "# Failure modes", "# Procedures", "# Scenarios")))
    check("aip-procedures", all(name in AIP for name in (
        "p0-scan-infrastructure-imports", "p0-assess-applicability",
        "p1-outbound-port-and-driven-adapter", "p2-driving-adapter",
        "p3-extract-use-case")))
    with tempfile.TemporaryDirectory() as directory:
        domain = Path(directory)
        (domain / "rule.py").write_text("import email_sdk\n")
        output = subprocess.check_output([
            str(ROOT / "aip" / "scripts" / "scan_domain_imports.py"),
            str(domain), "email_sdk",
        ], text=True)
        check("p0-script", str(domain / "rule.py") in json.loads(output)["violations"])


if __name__ == "__main__":
    main()
