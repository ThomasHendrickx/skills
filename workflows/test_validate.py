"""The validator holds every rule of the workflow file format, and bug-fix.yaml passes it."""

import copy
import pathlib
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


class BugFix(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
