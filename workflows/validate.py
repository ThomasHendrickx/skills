"""Check workflow files against the rules of the workflow file format.

Usage: python validate.py <file.yaml>...  Prints each error; exits 1 when any file fails.
"""

import re
import sys

import yaml

DECISIONS = {"replan", "one-more-round", "split", "stop", "ask"}
FAMILIES = {"any", "claude", "gpt"}
END = "finish"
STUCK = "stuck:"


class _Loader(yaml.SafeLoader):
    """SafeLoader with YAML 1.2 booleans: only true and false, so `on:` stays a key."""


_Loader.yaml_implicit_resolvers = {
    first: [(tag, regexp) for tag, regexp in resolvers if tag != "tag:yaml.org,2002:bool"]
    for first, resolvers in yaml.SafeLoader.yaml_implicit_resolvers.items()
}
_Loader.add_implicit_resolver(
    "tag:yaml.org,2002:bool", re.compile(r"^(?:true|True|TRUE|false|False|FALSE)$"), list("tTfF")
)


def load(path):
    with open(path) as f:
        return yaml.load(f, Loader=_Loader)


def errors(doc):
    found = []
    stages = doc.get("stages") or {}
    stuck = doc.get("stuck") or {}
    if not stages:
        return ["stages: none"]

    for situation, decisions in stuck.items():
        for decision in decisions or []:
            if decision not in DECISIONS:
                found.append(f"stuck.{situation}: decision {decision!r} is not one of {sorted(DECISIONS)}")

    def situation_listed(where, situation):
        if situation not in stuck:
            found.append(f"{where}: situation {situation!r} is not listed under stuck")

    for name, stage in stages.items():
        for decision, target in (stage.get("on") or {}).items():
            where = f"{name}.on.{decision}"
            if target == END or target in stages:
                continue
            if isinstance(target, str) and target.startswith(STUCK):
                situation_listed(where, target[len(STUCK):])
                continue
            found.append(f"{where}: {target!r} is not a stage, {END} or {STUCK}<situation>")
        if "rounds" in stage:
            situation_listed(f"{name}.rounds", "rounds")

        family = stage.get("family")
        if isinstance(family, dict) and set(family) == {"otherThan"}:
            other = family["otherThan"]
            if other not in stages:
                found.append(f"{name}.family: otherThan {other!r} is not a stage")
            elif not stages[other].get("writesCode"):
                found.append(f"{name}.family: otherThan {other!r} writes no code")
        elif family not in FAMILIES:
            found.append(f"{name}.family: {family!r} is not one of {sorted(FAMILIES)} or {{otherThan: <stage>}}")

        if stage.get("writesCode") and "onOrigin" not in (stage.get("checks") or []):
            found.append(f"{name}: writesCode without onOrigin among its checks")

    first = next(iter(stages))
    reached, todo = {first}, [first]
    while todo:
        for target in (stages[todo.pop()].get("on") or {}).values():
            if target in stages and target not in reached:
                reached.add(target)
                todo.append(target)
    for name in stages:
        if name not in reached:
            found.append(f"{name}: not reachable from {first}")
    return found


def main(paths):
    failed = False
    for path in paths:
        found = errors(load(path))
        for error in found:
            print(f"{path}: {error}")
        failed = failed or bool(found)
        if not found:
            print(f"{path}: valid")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
