#!/usr/bin/env python3
"""Report files under a domain path that import one of the named infra modules."""
import argparse
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("domain")
    parser.add_argument("infra_module", nargs="+")
    args = parser.parse_args()
    violations = []
    for path in Path(args.domain).rglob("*"):
        if path.is_file():
            try:
                text = path.read_text()
            except UnicodeDecodeError:
                continue
            if any(module in text for module in args.infra_module):
                violations.append(str(path))
    print(json.dumps({"violations": violations}))


if __name__ == "__main__":
    main()
