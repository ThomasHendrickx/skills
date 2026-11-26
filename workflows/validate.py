"""Check workflow files against the rules of the workflow file format.

Usage: python validate.py [--profile <path>] <file.yaml>...
Prints each error and exits 1 when any workflow fails validation.
"""

import argparse
import json
import re
import sys
from pathlib import Path

import yaml

DECISIONS = {"replan", "one-more-round", "split", "stop", "ask"}
OTHER_MODEL_FAMILY = {"claude": "gpt", "gpt": "claude"}
FAMILIES = {"any", *OTHER_MODEL_FAMILY}
HARNESSES = {"claude-code", "codex", "copilot", "antigravity", "local"}
STAGE_KEYS = {
    "role", "tier", "family", "deadlineMinutes", "writesCode", "input", "result",
    "checks", "tests", "on", "rounds", "skills", "harness", "model", "options", "mcpServers",
}
MCP_SERVER_NAME = re.compile(r"[A-Za-z0-9_-]+")
WORKFLOW_TYPE = re.compile(r"[a-z]{1,8}")
END = "finish"
STUCK = "stuck:"
ASK = "ask:"
STOP = "stop:"
RUNNER_SITUATIONS = ("rounds", "loop", "silent")
V1_SITUATIONS = (*RUNNER_SITUATIONS, "blocked", "needs-info")
V2_SITUATIONS = {
    *RUNNER_SITUATIONS, "needs-info", "high-risk", "design-needs-human",
    "implement-blocked", "implement-continue", "implement-protected", "fix-blocked",
    "fix-continue", "fix-needs-redesign", "fix-protected", "review-stuck",
    "review-qa-tests", "review-needs-human", "qa-fails", "qa-needs-human",
    "qa-incomplete", "qa-protected", "qa-setup", "merge-conflict",
}
V2_FIXED_DECISIONS = {"stop", "ask", "one-more-round", "split", "approve"}
V2_DECISION_STAGES = {
    "restart-analysis": "analyse", "design": "architect", "redesign": "architect",
    "implement": "implement", "fix": "fix", "qa": "qa", "resolve": "resolve",
}
V2_STATE_CONDITIONS = {"qaTests", "qaLoop", "reviewLoop", "afterQaFail"}
V2_CHECKS = {"onOrigin", "redFirst", "noRewrite", "size", "tests", "testsOnly", "headUnmoved"}
# moved: the run branch's head moved under the run. Its decisions are its own.
MOVED = "moved"
MOVED_DECISIONS = ("review", "take-head", "stop")
REVIEW_STAGE = "review"


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


def origin(stages, name):
    """The stage whose family `name` takes: itself, or the end of its sameAs chain."""
    seen = set()
    while name not in seen:
        seen.add(name)
        family = (stages.get(name) or {}).get("family")
        if not isinstance(family, dict) or set(family) != {"sameAs"}:
            break
        same = family["sameAs"]
        if not isinstance(same, str) or same not in stages:
            break
        name = same
    return name


def moved_targets(decisions, stages, found):
    """Check the moved situation's decisions; return the stages they send the run to."""
    where = f"stuck.{MOVED}"
    if not isinstance(decisions, list) or not decisions:
        found.append(f"{where}: expected a non-empty list of decisions")
        return []
    targets = []
    for decision in decisions:
        if not isinstance(decision, str) or decision not in MOVED_DECISIONS:
            found.append(f"{where}: decision {decision!r} is not one of {list(MOVED_DECISIONS)}")
        elif decision == "review":
            if REVIEW_STAGE in stages:
                targets.append(REVIEW_STAGE)
            else:
                found.append(f"{where}: 'review' needs a {REVIEW_STAGE!r} stage")
    return targets


def v1_routes(stages, stuck, found):
    routes = {}
    for situation, decisions in stuck.items():
        if situation == MOVED:
            routes[f"{STUCK}{MOVED}"] = moved_targets(decisions, stages, found)
            continue
        for decision in decisions or []:
            if not isinstance(decision, str) or decision not in DECISIONS:
                found.append(f"stuck.{situation}: decision {decision!r} is not one of {sorted(DECISIONS)}")

    for name, stage in stages.items():
        routes[name] = []
        for decision, target in (stage.get("on") or {}).items():
            where = f"{name}.on.{decision}"
            if isinstance(target, str) and (target == END or target in stages):
                routes[name].append(target)
                continue
            if isinstance(target, str) and target.startswith(STUCK):
                if target[len(STUCK):] not in stuck:
                    found.append(f"{where}: situation {target[len(STUCK):]!r} is not listed under stuck")
                continue
            found.append(f"{where}: {target!r} is not a stage, {END} or {STUCK}<situation>")
    return routes


def v2_stuck_routes(stuck, stages, found):
    routes = {}
    for situation, decisions in stuck.items():
        where = f"stuck.{situation}"
        if situation == MOVED:
            routes[f"{STUCK}{situation}"] = moved_targets(decisions, stages, found)
            continue
        if situation not in V2_SITUATIONS:
            found.append(f"{where}: unknown situation")
        if not isinstance(decisions, list) or not decisions:
            found.append(f"{where}: expected a non-empty list of decisions")
            continue
        targets = routes[f"{STUCK}{situation}"] = []
        for decision in decisions:
            if isinstance(decision, str) and decision in V2_FIXED_DECISIONS:
                continue
            if isinstance(decision, dict) and len(decision) == 1:
                word, target = next(iter(decision.items()))
                if word in V2_DECISION_STAGES and target == V2_DECISION_STAGES[word]:
                    if target in stages:
                        targets.append(target)
                    else:
                        found.append(f"{where}: {word!r} points to missing stage {target!r}")
                    continue
            found.append(f"{where}: invalid decision {decision!r}")
    return routes


def v2_rules(rules, where, stages, stuck, gates, field_tests, found):
    targets = []
    if not isinstance(rules, list) or not rules:
        found.append(f"{where}: expected a non-empty ordered rule list")
        return targets

    for index, rule in enumerate(rules, start=1):
        rule_at = f"{where}[{index}]"
        if not isinstance(rule, dict) or "go" not in rule or rule.keys() - {"go", "if"}:
            found.append(f"{rule_at}: expected a rule with go and optional if")
            continue

        target = rule["go"]
        ask = isinstance(target, str) and target.startswith(ASK)
        if index == len(rules) and ("if" in rule or ask):
            found.append(f"{rule_at}: last rule cannot have if or go to a gate")
        if ask and "if" in rule:
            found.append(f"{rule_at}: an ask rule cannot have if")
        if "if" in rule:
            condition = rule["if"]
            if isinstance(condition, dict) and len(condition) == 1:
                field_tests.append((f"{rule_at}.if", next(iter(condition))))
            elif not isinstance(condition, str) or condition not in V2_STATE_CONDITIONS:
                found.append(f"{rule_at}.if: expected one result field or a known state condition")

        if isinstance(target, str) and target:
            if target in stages or target == END:
                targets.append(target)
                continue
            _, _, value = target.partition(":")
            if target.startswith(STOP) and value.strip():
                continue
            if target.startswith(STUCK) and value:
                if value not in stuck:
                    found.append(f"{rule_at}.go: situation {value!r} is not listed under stuck")
                targets.append(target)
                continue
            if ask and value:
                if value not in gates:
                    found.append(f"{rule_at}.go: gate {value!r} is not listed under gates")
                targets.append(target)
                continue
        found.append(f"{rule_at}.go: {target!r} is not a stage, finish, stuck:<situation>, "
                     "ask:<gate> or stop:<reason>")
    return targets


def v2_field_errors(field_tests, stages, routes, found):
    with Path(__file__).with_name("result-fields.json").open(encoding="utf-8") as source:
        result_fields = json.load(source)

    # A chain of approval gates still reads the result of the stage that first asked.
    gate_kinds = {node: set() for node in field_tests if node.startswith(ASK)}
    stage_kinds = {}
    for stage, config in stages.items():
        kind = config.get("result")
        kind = kind if isinstance(kind, str) else None
        stage_kinds[stage] = kind
        todo, seen = list(routes[stage]), set()
        while todo:
            gate = todo.pop()
            if gate in gate_kinds and gate not in seen:
                seen.add(gate)
                gate_kinds[gate].add(kind)
                todo.extend(routes[gate])

    for node, tests in field_tests.items():
        kinds = gate_kinds[node] if node in gate_kinds else {stage_kinds[node]}
        for where, field in tests:
            if not kinds:
                found.append(f"{where}: no stage supplies a result to test")
            for kind in sorted(kinds, key=repr):
                if field not in result_fields.get(kind, []):
                    found.append(f"{where}: {field!r} is not a field of result kind {kind!r}")


def v2_routes(doc, stages, stuck, found):
    gates = doc.get("gates", {})
    if not isinstance(gates, dict):
        found.append("gates: expected a mapping")
        gates = {}
    routes = v2_stuck_routes(stuck, stages, found)
    field_tests = {}
    for name, stage in stages.items():
        routes[name] = []
        field_tests[name] = []
        decisions = stage.get("on", {})
        if not isinstance(decisions, dict):
            found.append(f"{name}.on: expected a mapping of decisions")
            continue
        for decision, rules in decisions.items():
            routes[name].extend(v2_rules(rules, f"{name}.on.{decision}", stages, stuck,
                                         gates, field_tests[name], found))

    for gate, answers in gates.items():
        where = f"gates.{gate}"
        node = f"{ASK}{gate}"
        if not isinstance(gate, str) or not gate or not isinstance(answers, dict) or not answers:
            found.append(f"{where}: expected a named gate with at least one answer")
            continue
        routes[node] = []
        field_tests[node] = []
        for answer, rules in answers.items():
            if isinstance(rules, str) and rules in stages:
                routes[node].append(rules)
            elif isinstance(rules, list):
                routes[node].extend(v2_rules(rules, f"{where}.{answer}", stages, stuck,
                                             gates, field_tests[node], found))
            else:
                found.append(f"{where}.{answer}: expected a stage or an ordered rule list")

    v2_field_errors(field_tests, stages, routes, found)
    return routes


def v2_settings(doc, stages, found):
    limits = doc.get("limits", {})
    if not isinstance(limits, dict):
        found.append("limits: expected a mapping")
    else:
        for budget in ("continues", "qaTestChanges"):
            if budget in limits and (type(limits[budget]) is not int or limits[budget] < 0):
                found.append(f"limits.{budget}: expected a non-negative integer")
    if "headCheck" in doc:
        head_check = doc["headCheck"]
        if not isinstance(head_check, list):
            found.append("headCheck: expected a list of stage names")
        else:
            for name in head_check:
                if not isinstance(name, str) or name not in stages:
                    found.append(f"headCheck: {name!r} is not a stage")
    for name, stage in stages.items():
        checks = stage.get("checks", [])
        if not isinstance(checks, list):
            found.append(f"{name}.checks: expected a list of checks")
        else:
            for check in checks:
                if not isinstance(check, str) or check not in V2_CHECKS:
                    found.append(f"{name}.checks: unknown check {check!r}")
        if "tests" in stage:
            tests = stage["tests"]
            if tests != "fromRepository" and (
                not isinstance(tests, list)
                or any(not isinstance(project, str) or not project.strip() for project in tests)
            ):
                found.append(f"{name}.tests: expected fromRepository or a list of test project names")


def model_family(model):
    if isinstance(model, str):
        prefix, dash, _ = model.partition("-")
        if dash and prefix in OTHER_MODEL_FAMILY:
            return prefix
    return None


def stage_model(stage, default_model):
    fallback = default_model if stage.get("harness") == "copilot" else None
    return stage.get("model", fallback)


def required_model_family(name, stages, default_model):
    """Resolve a family constraint as far as the workflow and profile allow."""
    family = stages[name].get("family")
    seen = {name}
    opposite = False
    while isinstance(family, dict) and set(family) in ({"sameAs"}, {"otherThan"}):
        relation, target = next(iter(family.items()))
        if not isinstance(target, str) or target not in stages or target in seen:
            return None
        seen.add(target)
        # Each otherThan reverses the required family along the chain.
        opposite ^= relation == "otherThan"
        stage = stages[target]
        family = model_family(stage_model(stage, default_model)) or stage.get("family")

    if isinstance(family, str) and family in OTHER_MODEL_FAMILY:
        return OTHER_MODEL_FAMILY[family] if opposite else family
    return None


def stage_settings(name, stages, default_model, found):
    stage = stages[name]
    for key in sorted(stage.keys() - STAGE_KEYS, key=repr):
        found.append(f"{name}.{key}: unknown stage key")

    harness = stage.get("harness")
    if "harness" in stage:
        if not isinstance(harness, str) or harness not in HARNESSES:
            found.append(f"{name}.harness: expected one of {sorted(HARNESSES)}")

    if "options" in stage:
        options = stage["options"]
        if not isinstance(options, dict) or any(not isinstance(key, str) for key in options):
            found.append(f"{name}.options: expected a mapping with string keys")

    if "mcpServers" in stage:
        servers = stage["mcpServers"]
        if not isinstance(servers, list) or any(
            not isinstance(server, str) or not MCP_SERVER_NAME.fullmatch(server) for server in servers
        ):
            found.append(f"{name}.mcpServers: expected a list of names matching {MCP_SERVER_NAME.pattern}")

    if "model" not in stage and harness != "copilot":
        return
    model = stage_model(stage, default_model)
    where = f"{name}.model"
    source = "model" if "model" in stage else "profile models.default"
    if not isinstance(model, str) or not model.strip():
        if "model" in stage:
            found.append(f"{where}: expected a non-empty model ID")
        else:
            found.append(f"{where}: Copilot requires a model or profile models.default")
        return

    family = model_family(model)
    required = required_model_family(name, stages, default_model)
    if required is not None and family != required:
        found.append(f"{where}: {source} must belong to the {required} family")
    elif family is None and stage.get("family") != "any":
        found.append(f"{where}: {source} without a known family requires family: any")


def errors(doc, profile=None):
    version = doc.get("version") if isinstance(doc, dict) else None
    if type(version) is not int or version not in (1, 2):
        return [f"version: expected 1 or 2, got {version!r}"]
    found = []
    if "type" in doc or version == 2:
        kind = doc.get("type")
        if not isinstance(kind, str) or not WORKFLOW_TYPE.fullmatch(kind):
            found.append(f"type: expected 1 to 8 lowercase letters, got {kind!r}")
    stages = doc.get("stages")
    stuck = doc.get("stuck", {})
    if not stages:
        return ["stages: none"]
    if not isinstance(stages, dict) or any(
        not isinstance(name, str) or not isinstance(stage, dict) for name, stage in stages.items()
    ):
        return ["stages: expected a mapping of stage names to stage definitions"]
    if not isinstance(stuck, dict):
        return ["stuck: expected a mapping of situations to decisions"]

    required_situations = V1_SITUATIONS if version == 1 else RUNNER_SITUATIONS
    for situation in required_situations:
        if situation not in stuck:
            found.append(f"stuck: situation {situation!r} is not listed under stuck")

    if version == 1:
        routes = v1_routes(stages, stuck, found)
    else:
        routes = v2_routes(doc, stages, stuck, found)
        v2_settings(doc, stages, found)

    models = profile.get("models") if isinstance(profile, dict) else None
    default_model = models.get("default") if isinstance(models, dict) else None
    for name, stage in stages.items():
        stage_settings(name, stages, default_model, found)
        family = stage.get("family")
        if isinstance(family, dict) and set(family) == {"otherThan"}:
            other = family["otherThan"]
            if not isinstance(other, str) or other not in stages:
                found.append(f"{name}.family: otherThan {other!r} is not a stage")
            elif not stages[other].get("writesCode"):
                found.append(f"{name}.family: otherThan {other!r} writes no code")
        elif isinstance(family, dict) and set(family) == {"sameAs"}:
            same = family["sameAs"]
            if not isinstance(same, str) or same not in stages:
                found.append(f"{name}.family: sameAs {same!r} is not a stage")
            elif not stages[same].get("writesCode"):
                found.append(f"{name}.family: sameAs {same!r} writes no code")
        elif not isinstance(family, str) or family not in FAMILIES:
            found.append(
                f"{name}.family: {family!r} is not one of {sorted(FAMILIES)}, "
                "{otherThan: <stage>} or {sameAs: <stage>}"
            )

        # A stage reviewing code is otherThan the family of each stage that writes that code.
        if isinstance(family, dict) and set(family) == {"otherThan"} and isinstance(
            family["otherThan"], str
        ) and family["otherThan"] in stages:
            reference = origin(stages, family["otherThan"])
            for inp in stage.get("input") or []:
                writer = inp[len("results."):] if isinstance(inp, str) and inp.startswith("results.") else None
                if writer in stages and stages[writer].get("writesCode") and origin(stages, writer) != reference:
                    found.append(
                        f"{name}.family: otherThan {family['otherThan']!r} does not cover {writer!r}, "
                        "which writes code it reviews"
                    )

        checks = stage.get("checks") or []
        if stage.get("writesCode") and (not isinstance(checks, (list, str)) or "onOrigin" not in checks):
            found.append(f"{name}: writesCode without onOrigin among its checks")

    first = next(iter(stages))
    reached, todo = {first}, [first]
    implicit_situations = (*RUNNER_SITUATIONS, MOVED) if version == 2 else (MOVED,)
    todo.extend(f"{STUCK}{situation}" for situation in implicit_situations
                if f"{STUCK}{situation}" in routes)
    while todo:
        for target in routes[todo.pop()]:
            if target in routes and target not in reached:
                reached.add(target)
                todo.append(target)
    for name in stages:
        if name not in reached:
            found.append(f"{name}: not reachable from {first}")
    return found


def main(paths, profile=None):
    failed = False
    for path in paths:
        found = errors(load(path), profile)
        for error in found:
            print(f"{path}: {error}")
        failed = failed or bool(found)
        if not found:
            print(f"{path}: valid")
    return 1 if failed else 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Validate workflow files.")
    parser.add_argument("--profile", help="repository workflow profile supplying models.default")
    parser.add_argument("paths", nargs="*", metavar="file.yaml")
    args = parser.parse_args()
    profile = None
    if args.profile is not None:
        try:
            profile = load(args.profile)
        except (OSError, UnicodeError, yaml.YAMLError):
            parser.error(f"could not read profile {args.profile!r} as YAML")
    sys.exit(main(args.paths, profile))
