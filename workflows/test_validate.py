"""The validator holds every rule of the workflow file format, and bug-fix.yaml passes it."""

import copy
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest

from validate import errors, load

HERE = pathlib.Path(__file__).parent


def bug_fix():
    return load(HERE / "bug-fix.yaml")


class EveryWorkflowFile(unittest.TestCase):
    def test_every_file_passes(self):
        files = sorted(HERE.glob("*.yaml"))
        self.assertTrue(files)
        for path in files:
            with self.subTest(file=path.name):
                self.assertEqual(errors(load(path)), [])


class Feature(unittest.TestCase):
    def test_gate_order_matches_analysis_size_and_design_risk(self):
        workflow = load(HERE / "feature.yaml")
        stages = workflow["stages"]
        small = {"if": {"size": "small"}, "go": "implement"}
        standard = {"go": "architect"}
        self.assertEqual(stages["analyse"]["on"]["analyzed"], [
            {"go": "ask:analysis"}, small, standard,
        ])
        self.assertEqual(workflow["gates"]["analysis"]["approve"], [small, standard])
        self.assertEqual(stages["architect"]["on"]["ready"], [
            {"go": "ask:design"},
            {"if": {"risk": "high"}, "go": "stuck:high-risk"},
            {"go": "implement"},
        ])

    def test_review_covers_qa_test_commits_before_finish(self):
        workflow = load(HERE / "feature.yaml")
        qa, review = (workflow["stages"][name] for name in ("qa", "review"))
        self.assertEqual(qa["family"], {"sameAs": "implement"})
        self.assertTrue(qa["writesCode"])
        self.assertEqual(qa["checks"], ["onOrigin", "testsOnly"])
        self.assertIn("results.qa", review["input"])
        self.assertEqual(review["family"], {"otherThan": "implement"})
        self.assertEqual(review["on"]["request-changes"][0], {"if": "qaTests", "go": "qa"})
        self.assertEqual(workflow["headCheck"], ["review", "qa"])


    def test_approved_qa_tests_resume_the_saved_qa_verdict(self):
        stages = load(HERE / "feature.yaml")["stages"]
        # The runner resumes the saved verdict after approving QA's test commits.
        self.assertEqual(stages["review"]["on"]["approve"], [{"go": "qa"}])
        self.assertEqual(stages["qa"]["on"]["pass"], [{"go": "finish"}])
        self.assertEqual(stages["qa"]["on"]["fail"], [
            {"if": "qaLoop", "go": "stuck:qa-fails"},
            {"go": "fix"},
        ])


class BugFix(unittest.TestCase):
    def test_bug_fix_stays_at_version_one(self):
        self.assertEqual(bug_fix()["version"], 1)
        self.assertEqual(errors(bug_fix()), [])

    def test_each_workflow_file_carries_its_type(self):
        self.assertEqual(bug_fix()["type"], "fix")
        self.assertEqual(load(HERE / "feature.yaml")["type"], "feat")

    def test_on_stays_a_key(self):
        # YAML 1.1 reads a bare `on` as true; the format means the word.
        self.assertIn("on", bug_fix()["stages"]["analyse"])

    def test_reviewer_takes_the_other_family_than_the_implementor(self):
        self.assertEqual(bug_fix()["stages"]["review"]["family"], {"otherThan": "implement"})

    def test_fix_stays_in_the_implementors_family(self):
        self.assertEqual(bug_fix()["stages"]["fix"]["family"], {"sameAs": "implement"})

    def test_first_stage_gets_the_ticket_text(self):
        first = next(iter(bug_fix()["stages"].values()))
        self.assertIn("issue", first["input"])

    def test_code_stages_check_origin_and_red_first(self):
        for name, stage in bug_fix()["stages"].items():
            if stage["writesCode"]:
                with self.subTest(stage=name):
                    self.assertIn("onOrigin", stage["checks"])
                    self.assertIn("redFirst", stage["checks"])

    def test_bug_fix_reads_test_projects_from_the_repository(self):
        for name in ("implement", "fix"):
            with self.subTest(stage=name):
                self.assertEqual(bug_fix()["stages"][name]["tests"], "fromRepository")


class EachRuleRefuses(unittest.TestCase):
    def refused(self, change, expected):
        doc = copy.deepcopy(bug_fix())
        change(doc)
        found = errors(doc)
        self.assertTrue(any(expected in e for e in found), found)

    def test_on_target_not_a_stage_finish_or_stuck(self):
        self.refused(lambda d: d["stages"]["analyse"]["on"].update(ready="implementer"),
                     "analyse.on.ready: 'implementer'")

    def test_stuck_situation_not_listed(self):
        self.refused(lambda d: d["stages"]["implement"]["on"].update(blocked="stuck:wedged"),
                     "situation 'wedged' is not listed")

    def test_rounds_without_rounds_situation(self):
        self.refused(lambda d: d["stuck"].pop("rounds"), "situation 'rounds' is not listed")

    def test_loop_situation_not_listed(self):
        self.refused(lambda d: d["stuck"].pop("loop"), "situation 'loop' is not listed")

    def test_silent_situation_not_listed(self):
        self.refused(lambda d: d["stuck"].pop("silent"), "situation 'silent' is not listed")

    def test_fix_in_any_family_can_land_in_the_reviewers(self):
        self.refused(lambda d: d["stages"]["fix"].update(family="any"),
                     "review.family: otherThan 'implement' does not cover 'fix'")

    def test_fix_bound_to_the_reviewers_family(self):
        self.refused(lambda d: d["stages"]["fix"].update(family={"sameAs": "review"}),
                     "fix.family: sameAs 'review' writes no code")

    def test_same_as_names_no_stage(self):
        self.refused(lambda d: d["stages"]["fix"].update(family={"sameAs": "build"}),
                     "fix.family: sameAs 'build' is not a stage")

    def test_decision_outside_the_five(self):
        self.refused(lambda d: d["stuck"]["blocked"].append("escalate"),
                     "stuck.blocked: decision 'escalate'")

    def test_other_than_names_a_stage_that_writes_no_code(self):
        self.refused(lambda d: d["stages"]["review"].update(family={"otherThan": "analyse"}),
                     "review.family: otherThan 'analyse' writes no code")

    def test_other_than_names_no_stage(self):
        self.refused(lambda d: d["stages"]["review"].update(family={"otherThan": "build"}),
                     "review.family: otherThan 'build' is not a stage")

    def test_code_stage_without_on_origin(self):
        self.refused(lambda d: d["stages"]["fix"]["checks"].remove("onOrigin"),
                     "fix: writesCode without onOrigin")

    def test_unreachable_stage(self):
        def orphan(d):
            d["stages"]["review"]["on"]["changes"] = "stuck:blocked"
        self.refused(orphan, "fix: not reachable from analyse")

    def test_family_outside_the_four(self):
        self.refused(lambda d: d["stages"]["analyse"].update(family="gemini"),
                     "analyse.family: 'gemini'")


class StageHarnessSettings(unittest.TestCase):
    def setUp(self):
        self.doc = load(HERE / "feature.yaml")
        self.stage = self.doc["stages"]["analyse"]

    def assert_field_error(self, found, field):
        self.assertTrue(any(error.startswith(f"{field}:") for error in found), found)

    def test_stage_accepts_each_harness_and_the_new_keys(self):
        self.stage.update(model="gpt-5", options={}, mcpServers=["search", "repo-index"])
        for harness in ("claude-code", "codex", "copilot", "antigravity", "local"):
            with self.subTest(harness=harness):
                self.stage["harness"] = harness
                self.assertEqual(errors(self.doc), [])

    def test_version_one_also_accepts_the_new_stage_keys(self):
        doc = bug_fix()
        doc["stages"]["analyse"].update(harness="copilot", model="gpt-5", options={}, mcpServers=[])
        self.assertEqual(errors(doc), [])
        doc["stages"]["analyse"]["harness"] = "terminal"
        self.assert_field_error(errors(doc), "analyse.harness")

    def test_unknown_harness_is_refused(self):
        for harness in ("terminal", None, ["codex"]):
            with self.subTest(harness=harness):
                self.stage["harness"] = harness
                self.assert_field_error(errors(self.doc), "analyse.harness")

    def test_unknown_stage_key_is_refused(self):
        self.stage["mcpServer"] = ["search"]
        self.assert_field_error(errors(self.doc), "analyse.mcpServer")

    def test_options_are_a_mapping_with_string_keys(self):
        self.stage["options"] = {"setting": {"nested": [True, "value"]}}
        self.assertEqual(errors(self.doc), [])
        for options in (None, "setting", ["setting"], {42: "value"}):
            with self.subTest(options=options):
                self.stage["options"] = options
                self.assert_field_error(errors(self.doc), "analyse.options")

    def test_mcp_servers_are_a_list_of_names(self):
        for servers in (
            "search", None, {"search": {}}, [42], [""], ["two words"],
            ["https://example.com/mcp"], ["./server"], [{"command": "server"}],
        ):
            with self.subTest(servers=servers):
                self.stage["mcpServers"] = servers
                self.assert_field_error(errors(self.doc), "analyse.mcpServers")

    def test_copilot_needs_a_model(self):
        self.stage["harness"] = "copilot"
        self.assert_field_error(errors(self.doc), "analyse.model")

    def test_copilot_can_use_a_compatible_profile_default(self):
        self.stage.update(harness="copilot", family="gpt")
        self.assertEqual(errors(self.doc, profile={"models": {"default": "gpt-5"}}), [])
        for default in ("claude-sonnet-4-6", "custom-model", "", None):
            with self.subTest(default=default):
                found = errors(self.doc, profile={"models": {"default": default}})
                self.assert_field_error(found, "analyse.model")

    def test_copilot_uses_its_explicit_model_ahead_of_the_default(self):
        profile = {"models": {"default": "claude-sonnet-4-6"}}
        self.stage.update(harness="copilot", family="gpt", model="gpt-5")
        self.assertEqual(errors(self.doc, profile=profile), [])
        self.stage.update(family="claude")
        self.assert_field_error(errors(self.doc, profile=profile), "analyse.model")

    def test_cli_accepts_a_profile_file(self):
        self.stage.update(harness="copilot", family="gpt")
        with tempfile.TemporaryDirectory() as scratch:
            workflow = pathlib.Path(scratch) / "workflow.yaml"
            workflow.write_text(json.dumps(self.doc), encoding="utf-8")
            profile = pathlib.Path(scratch) / "profile.yml"
            profile.write_text("models:\n  default: gpt-5\n", encoding="utf-8")
            command = [sys.executable, str(HERE / "validate.py"), str(workflow)]
            without_profile = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(without_profile.returncode, 1, without_profile.stdout)
            self.assertIn("analyse.model:", without_profile.stdout)
            with_profile = subprocess.run(
                [*command, "--profile", str(profile)], capture_output=True, text=True,
            )
            self.assertEqual(with_profile.returncode, 0, with_profile.stdout + with_profile.stderr)

    def test_stage_model_must_match_a_fixed_family(self):
        for family, model in (("claude", "gpt-5"), ("gpt", "claude-sonnet-4-6")):
            with self.subTest(family=family, model=model):
                self.stage.update(family=family, model=model)
                self.assert_field_error(errors(self.doc), "analyse.model")

    def test_an_unclassified_model_requires_family_any(self):
        self.stage["model"] = "custom-model"
        self.assertEqual(errors(self.doc), [])
        self.stage["family"] = "gpt"
        self.assert_field_error(errors(self.doc), "analyse.model")
        self.doc["stages"]["qa"]["model"] = "custom-model"
        self.assert_field_error(errors(self.doc), "qa.model")

    def test_relative_families_use_a_statically_known_model_family(self):
        stages = self.doc["stages"]
        stages["implement"]["model"] = "gpt-5"
        stages["qa"].update(family={"sameAs": "fix"}, model="gpt-5")
        stages["review"]["model"] = "claude-sonnet-4-6"
        self.assertEqual(errors(self.doc), [])

        stages["qa"]["model"], stages["review"]["model"] = (
            stages["review"]["model"], stages["qa"]["model"],
        )
        found = errors(self.doc)
        self.assert_field_error(found, "qa.model")
        self.assert_field_error(found, "review.model")

    def test_relative_family_waits_for_a_model_selected_at_runtime(self):
        self.doc["stages"]["review"]["model"] = "gpt-5"
        self.assertEqual(errors(self.doc), [])

    def test_relative_family_also_applies_to_the_profile_default(self):
        stages = self.doc["stages"]
        stages["implement"]["family"] = "gpt"
        stages["review"]["harness"] = "copilot"
        self.assertEqual(errors(self.doc, profile={"models": {"default": "claude-sonnet-4-6"}}), [])
        found = errors(self.doc, profile={"models": {"default": "gpt-5"}})
        self.assert_field_error(found, "review.model")

    def test_stage_model_is_a_nonempty_string(self):
        for model in (None, 42, ["gpt-5"], {}, "", "  "):
            with self.subTest(model=model):
                self.stage["model"] = model
                self.assert_field_error(errors(self.doc), "analyse.model")


V2_SITUATIONS = (
    "rounds", "loop", "silent", "needs-info", "high-risk", "design-needs-human",
    "implement-blocked", "implement-continue", "implement-protected", "fix-blocked",
    "fix-continue", "fix-needs-redesign", "fix-protected", "review-stuck",
    "review-qa-tests", "review-needs-human", "qa-fails", "qa-needs-human",
    "qa-incomplete", "qa-protected", "qa-setup",
)


class VersionTwo(unittest.TestCase):
    def setUp(self):
        self.doc = {
            "version": 2,
            "type": "feat",
            "limits": {"continues": 3, "qaTestChanges": 2},
            "stages": {
                "analyse": {
                    "family": "any", "result": "analysis", "on": {
                        "analyzed": [
                            {"go": "ask:analysis"},
                            {"if": {"size": "small"}, "go": "implement"},
                            {"go": "implement"},
                        ],
                        "needs-info": [{"go": "stuck:needs-info"}],
                        "out-of-scope": [{"go": "stop:out-of-scope"}],
                    },
                },
                "architect": {
                    "family": "any", "result": "design", "on": {
                        "ready": [
                            {"if": {"risk": "high"}, "go": "stuck:high-risk"},
                            {"go": "implement"},
                        ],
                    },
                },
                "implement": {"family": "any", "result": "code", "on": {"done": [{"go": "review"}]}},
                "review": {
                    "family": "any", "result": "review", "rounds": 3, "on": {
                        "approve": [{"if": "qaTests", "go": "finish"}, {"go": "qa"}],
                        "request-changes": [{"go": "fix"}],
                        "needs-human": [{"go": "stuck:review-needs-human"}],
                    },
                },
                "qa": {
                    "family": "any", "result": "qa", "writesCode": True, "rounds": 3,
                    "checks": ["onOrigin", "testsOnly"], "tests": "fromRepository", "on": {
                        "pass": [{"go": "finish"}],
                        "needs-human": [
                            {"if": {"cause": "setup"}, "go": "stuck:qa-setup"},
                            {"go": "stuck:qa-needs-human"},
                        ],
                    },
                },
                "fix": {"family": "any", "result": "code", "on": {"done": [{"go": "review"}]}},
            },
            "gates": {
                "analysis": {
                    "approve": [
                        {"if": {"size": "small"}, "go": "implement"},
                        {"go": "architect"},
                    ],
                    "change": "analyse",
                },
            },
            "stuck": {situation: ["stop"] for situation in V2_SITUATIONS},
        }
        self.doc["stuck"].update({
            "needs-info": [{"restart-analysis": "analyse"}, "ask", "stop"],
            "high-risk": [{"implement": "implement"}, {"redesign": "architect"}, "stop"],
            "review-needs-human": [{"fix": "fix"}, {"design": "architect"}, "approve", "stop"],
            "qa-needs-human": [{"qa": "qa"}, "stop"],
            "qa-setup": ["one-more-round", "stop"],
            "rounds": ["one-more-round", "split", "ask", "stop"],
        })
        self.rules = self.doc["stages"]["analyse"]["on"]["analyzed"]

    def refused(self, expected):
        found = errors(self.doc)
        self.assertTrue(any(expected in error for error in found), found)

    def test_valid_v2_with_no_head_check_key(self):
        self.assertEqual(errors(self.doc), [])

    def test_type_is_required_in_version_two(self):
        del self.doc["type"]
        self.refused("type:")

    def test_type_is_lowercase_letters_up_to_eight(self):
        for value in ("fix", "feat", "abcdefgh"):
            with self.subTest(value=value):
                self.doc["type"] = value
                self.assertEqual(errors(self.doc), [])
        for value in ("", "abcdefghi", "Fix", "bug-fix", "fix1", "fïx", 1, None, ["fix"]):
            with self.subTest(value=value):
                self.doc["type"] = value
                self.refused("type:")

    def test_version_one_checks_a_type_it_carries(self):
        doc = bug_fix()
        del doc["type"]
        self.assertEqual(errors(doc), [])
        doc["type"] = "Bug-Fix"
        self.assertTrue(any("type:" in error for error in errors(doc)))

    def test_only_integer_versions_one_and_two_are_supported(self):
        for value in (None, True, "2", 2.0, 0, 3, []):
            with self.subTest(value=value):
                self.doc["version"] = value
                self.refused("version:")
        del self.doc["version"]
        self.refused("version:")

    def test_decision_needs_a_non_empty_rule_list(self):
        for value in ("implement", [], {}):
            with self.subTest(value=value):
                self.doc["stages"]["analyse"]["on"]["analyzed"] = value
                self.refused("ordered rule list")

    def test_rule_needs_a_go_target_and_has_only_if_and_go_keys(self):
        for rule in ("implement", {"if": "qaTests"}, {"go": "implement", "when": "qaTests"}):
            with self.subTest(rule=rule):
                self.rules[1] = rule
                self.refused("analyse.on.analyzed[2]")

    def test_final_rule_has_no_if_even_when_null(self):
        for condition in ("qaTests", None):
            with self.subTest(condition=condition):
                self.rules[-1]["if"] = condition
                self.refused("last rule")

    def test_final_rule_cannot_ask(self):
        self.rules[-1]["go"] = "ask:analysis"
        self.refused("last rule")

    def test_ask_rule_has_no_if_and_names_a_declared_gate(self):
        self.rules[0]["if"] = "qaTests"
        self.refused("ask rule cannot have if")
        self.rules[0] = {"go": "ask:missing"}
        self.refused("gate 'missing' is not listed")

    def test_go_target_must_be_a_stage_or_a_supported_special_target(self):
        for target in ("missing", "stop:", "ask:", "stuck:", {"stop": "reason"}):
            with self.subTest(target=target):
                self.rules[1]["go"] = target
                self.refused("analyse.on.analyzed[2].go")
        self.rules[1]["go"] = "stuck:qa-fails"
        del self.doc["stuck"]["qa-fails"]
        self.refused("situation 'qa-fails' is not listed")

    def test_condition_is_one_result_field_or_a_known_state(self):
        for condition in ({"risk": "high"}, {"size": "small", "risk": "high"},
                          "unknown", "approveSpec", "budget:continues", [], None):
            with self.subTest(condition=condition):
                self.rules[1]["if"] = condition
                self.refused("analyse.on.analyzed[2].if")

    def test_aw_state_predicates_are_accepted_as_scalars(self):
        for name in ("qaTests", "qaLoop", "reviewLoop", "afterQaFail"):
            with self.subTest(name=name):
                self.rules[1]["if"] = name
                self.assertEqual(errors(self.doc), [])

    def test_result_fields_are_shared_data(self):
        with (HERE / "result-fields.json").open() as f:
            fields = json.load(f)
        self.assertEqual(set(fields), {"analysis", "code", "design", "review", "qa", "lead"})
        for stage in self.doc["stages"].values():
            for field in fields[stage["result"]]:
                with self.subTest(kind=stage["result"], field=field):
                    rules = next(iter(stage["on"].values()))
                    rules.insert(0, {"if": {field: "value"}, "go": "finish"})
                    self.assertEqual(errors(self.doc), [])
                    rules.pop(0)

    def test_shared_top_level_fields_are_available_for_every_result(self):
        with (HERE / "result-fields.json").open() as f:
            fields = json.load(f)
        for kind, names in fields.items():
            with self.subTest(kind=kind):
                self.assertTrue({"task", "issue", "status", "pr", "runId"} <= set(names))

    def test_gate_answers_must_name_stages_or_use_ordered_rules(self):
        for answer in ("missing", "finish", [{"if": "qaTests", "go": "architect"}]):
            with self.subTest(answer=answer):
                self.doc["gates"]["analysis"]["approve"] = answer
                self.refused("gates.analysis.approve")

    def test_gate_field_tests_use_the_asking_stages_result(self):
        self.doc["gates"]["analysis"]["approve"][0]["if"] = {"risk": "high"}
        self.refused("gates.analysis.approve[1].if")
        self.doc["gates"]["analysis"]["approve"][0]["if"] = {"size": "small"}
        self.doc["stages"]["architect"]["on"]["ready"].insert(0, {"go": "ask:analysis"})
        self.refused("gates.analysis.approve[1].if")

    def test_gate_field_tests_work_through_another_gate(self):
        self.doc["gates"]["analysis"]["approve"].insert(0, {"go": "ask:another"})
        self.doc["gates"]["another"] = {
            "approve": [{"if": {"size": "small"}, "go": "implement"}, {"go": "architect"}],
        }
        self.assertEqual(errors(self.doc), [])
        self.doc["gates"]["another"]["approve"][0]["if"] = {"risk": "high"}
        self.refused("gates.another.approve[1].if")

    def test_stuck_situation_must_be_known(self):
        self.doc["stuck"]["blocked"] = ["stop"]
        self.refused("stuck.blocked")

    def test_runner_situations_must_be_declared(self):
        for situation in ("rounds", "loop", "silent"):
            with self.subTest(situation=situation):
                decisions = self.doc["stuck"].pop(situation)
                self.refused(f"situation {situation!r} is not listed")
                self.doc["stuck"][situation] = decisions

    def test_stuck_decisions_use_the_fixed_names_and_stage_table(self):
        for decision in ("replan", "redesign", {"restart-analysis": "architect"},
                         {"approve": "qa"}, {"ask": "qa"}, {"unknown": "qa"}):
            with self.subTest(decision=decision):
                self.doc["stuck"]["needs-info"].append(decision)
                self.refused("stuck.needs-info")
                self.doc["stuck"]["needs-info"].pop()
        del self.doc["stages"]["fix"]
        self.refused("stuck.review-needs-human")

    def test_stuck_stage_targets_count_toward_reachability(self):
        del self.doc["stages"]["review"]["on"]["request-changes"]
        self.assertEqual(errors(self.doc), [])
        self.doc["stuck"]["review-needs-human"].remove({"fix": "fix"})
        self.refused("fix: not reachable from analyse")

    def test_runner_stuck_decision_makes_stage_reachable(self):
        del self.doc["stages"]["analyse"]["on"]["analyzed"]
        self.doc["stuck"]["rounds"] = [{"redesign": "architect"}, "stop"]
        self.assertNotIn("architect: not reachable from analyse", errors(self.doc))

    def test_continues_and_qa_test_changes_accept_non_negative_integers(self):
        for key in ("continues", "qaTestChanges"):
            for value in (-1, True, "2", 2.0, None):
                with self.subTest(budget=key, value=value):
                    self.doc["limits"][key] = value
                    self.refused(f"limits.{key}")
            self.doc["limits"][key] = 0
            self.assertEqual(errors(self.doc), [])

    def test_v2_checks_and_qa_test_source_are_validated(self):
        qa = self.doc["stages"]["qa"]
        qa["checks"].append("testOnly")
        self.refused("qa.checks")
        qa["checks"].pop()
        qa["tests"] = ["end-to-end"]
        self.assertEqual(errors(self.doc), [])
        qa["tests"] = "fromProfile"
        self.refused("qa.tests")

    def test_head_check_names_stages_of_the_file(self):
        self.doc["headCheck"] = ["review", "qa"]
        self.assertEqual(errors(self.doc), [])
        for value in (["reveiw"], ["review", "finish"], [None]):
            with self.subTest(value=value):
                self.doc["headCheck"] = value
                self.refused("headCheck: ")
        for value in ("review", {"review": True}, None):
            with self.subTest(value=value):
                self.doc["headCheck"] = value
                self.refused("headCheck: expected a list of stage names")


class Moved(unittest.TestCase):
    """The moved situation: the head moved under a run, with review, take-head and stop."""

    def setUp(self):
        self.v2 = VersionTwo("test_valid_v2_with_no_head_check_key")
        self.v2.setUp()

    def docs(self):
        return {"version 1": bug_fix(), "version 2": copy.deepcopy(self.v2.doc)}

    def test_moved_accepts_review_take_head_and_stop(self):
        for version, doc in self.docs().items():
            for decisions in (["review", "take-head", "stop"], ["take-head", "stop"], ["stop"]):
                with self.subTest(version=version, decisions=decisions):
                    doc["stuck"]["moved"] = decisions
                    self.assertEqual(errors(doc), [])

    def test_moved_refuses_review_without_a_review_stage(self):
        for version, doc in self.docs().items():
            with self.subTest(version=version):
                doc["stages"]["check"] = doc["stages"].pop("review")
                for stage in doc["stages"].values():
                    for decision, target in (stage.get("on") or {}).items():
                        if target == "review":
                            stage["on"][decision] = "check"
                        elif isinstance(target, list):
                            for rule in target:
                                if rule["go"] == "review":
                                    rule["go"] = "check"
                doc["stuck"]["moved"] = ["take-head", "stop"]
                self.assertEqual(errors(doc), [])
                doc["stuck"]["moved"] = ["review", "take-head", "stop"]
                found = errors(doc)
                self.assertTrue(any("stuck.moved" in error and "review" in error
                                    for error in found), found)

    def test_moved_refuses_other_decisions(self):
        for version, doc in self.docs().items():
            for decision in ("ask", "one-more-round", "replan", "approve", {"review": "review"}):
                with self.subTest(version=version, decision=decision):
                    doc["stuck"]["moved"] = [decision, "stop"]
                    found = errors(doc)
                    self.assertTrue(any("stuck.moved" in error for error in found), found)

    def test_review_and_take_head_belong_to_moved_alone(self):
        for version, doc in self.docs().items():
            for decision in ("review", "take-head"):
                with self.subTest(version=version, decision=decision):
                    doc["stuck"]["silent"] = [decision, "stop"]
                    found = errors(doc)
                    self.assertTrue(any("stuck.silent" in error for error in found), found)
                    doc["stuck"]["silent"] = ["stop"]

    def test_head_unmoved_is_an_accepted_check(self):
        doc = self.v2.doc
        doc["stages"]["review"]["checks"] = ["headUnmoved"]
        self.assertEqual(errors(doc), [])
        doc["stages"]["review"]["checks"] = ["headMoved"]
        self.assertTrue(any("review.checks" in error for error in errors(doc)))

    def test_both_workflow_files_list_moved_with_its_three_decisions(self):
        for path in (HERE / "bug-fix.yaml", HERE / "feature.yaml"):
            with self.subTest(file=path.name):
                self.assertEqual(load(path)["stuck"]["moved"], ["review", "take-head", "stop"])


if __name__ == "__main__":
    unittest.main()
