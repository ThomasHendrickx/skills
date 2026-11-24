import json
import subprocess
import tempfile
import unittest
from pathlib import Path

import harness

HERE = Path(__file__).parent
FIXTURES = HERE / "fixtures"


class StripInstruction(unittest.TestCase):
    def test_removes_the_pitfalls_instruction_and_nothing_else(self):
        text = (harness.SKILL / "SKILL.md").read_text()
        self.assertIn("pitfalls.md", text)
        stripped = harness.strip_instruction(text)
        self.assertNotIn("pitfalls.md", stripped)
        self.assertIn("Skip what lint, types or tests already enforce.", stripped)

    def test_fails_loudly_when_the_instruction_is_gone(self):
        with self.assertRaises(ValueError):
            harness.strip_instruction("no such sentence")


class Fixtures(unittest.TestCase):
    def test_each_change_diff_applies_to_the_shared_base(self):
        for name in ("with-pitfalls", "without-pitfalls"):
            with tempfile.TemporaryDirectory() as d:
                base = FIXTURES / "_shared" / "src"
                (Path(d) / "src").mkdir()
                (Path(d) / "src" / "sync.py").write_text((base / "sync.py").read_text())
                r = subprocess.run(["git", "apply", "--check", str(FIXTURES / name / "change.diff")],
                                   cwd=d, capture_output=True, text=True)
                self.assertEqual(r.returncode, 0, r.stderr)

    def test_every_expected_hit_is_in_the_diff(self):
        diff = (FIXTURES / "with-pitfalls" / "change.diff").read_text()
        hits = json.loads((FIXTURES / "with-pitfalls" / "expected.json").read_text())["hit"]
        evidence = {
            "P1": "while True",
            "P2": "return True",
            "P3": "due_text",
        }
        for i in hits:
            self.assertIn(evidence[i], diff, i)

    def test_swallowed_error_returns_success_on_that_path(self):
        diff = (FIXTURES / "with-pitfalls" / "change.diff").read_text()
        lines = [l[1:].strip() for l in diff.splitlines() if l.startswith("+")]
        i = lines.index("except Exception:")
        self.assertIn("return True", lines[i + 1:i + 3])


class Prepare(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.work = Path(self.tmp.name)
        harness.prepare(self.work)

    def tearDown(self):
        self.tmp.cleanup()

    def test_builds_every_form_for_every_fixture(self):
        for form in ("with-instruction", "without-instruction"):
            for fx in ("with-pitfalls", "without-pitfalls"):
                run = self.work / form / fx
                self.assertTrue((run / "PROMPT.md").exists())
                self.assertTrue((run / "skill" / "SKILL.md").exists())
                self.assertTrue((run / "repo" / "src" / "sync.py").exists())

    def test_pitfalls_file_only_where_the_fixture_has_one(self):
        self.assertTrue((self.work / "with-instruction/with-pitfalls/repo/pitfalls.md").exists())
        self.assertFalse((self.work / "with-instruction/without-pitfalls/repo/pitfalls.md").exists())

    def test_repo_branch_holds_the_change(self):
        repo = self.work / "with-instruction/with-pitfalls/repo"
        out = subprocess.run(["git", "diff", "main...HEAD", "--stat"], cwd=repo,
                             capture_output=True, text=True).stdout
        self.assertIn("src/sync.py", out)

    def test_prompt_asks_for_the_report_as_the_reply(self):
        text = (self.work / "with-instruction/with-pitfalls/PROMPT.md").read_text()
        self.assertIn("final reply", text)
        self.assertNotIn("Write the review report to", text)

    def test_instruction_is_only_in_the_with_form(self):
        a = (self.work / "with-instruction/with-pitfalls/skill/SKILL.md").read_text()
        b = (self.work / "without-instruction/with-pitfalls/skill/SKILL.md").read_text()
        self.assertIn("pitfalls.md", a)
        self.assertNotIn("pitfalls.md", b)


class Check(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.work = Path(self.tmp.name)
        harness.prepare(self.work)

    def tearDown(self):
        self.tmp.cleanup()

    def test_missing_report_is_not_run_never_pass(self):
        rows = harness.check(self.work)
        self.assertTrue(all(r[2] == "NOT RUN" for r in rows))

    def test_correct_report_passes_and_incomplete_one_fails(self):
        run = self.work / "with-instruction/with-pitfalls"
        (run / "REPORT.md").write_text("Pitfalls checked: P1, P2, P3\nPitfalls hit: P1, P2, P3\n")
        run = self.work / "without-instruction/with-pitfalls"
        (run / "REPORT.md").write_text("Standards: none\n")
        got = {(r[0], r[1]): r[2] for r in harness.check(self.work)}
        self.assertEqual(got[("with-instruction", "with-pitfalls")], "PASS")
        self.assertEqual(got[("without-instruction", "with-pitfalls")], "FAIL")


if __name__ == "__main__":
    unittest.main()
