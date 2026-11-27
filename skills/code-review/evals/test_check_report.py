import unittest
from check_report import parse_pitfalls, check_report

PITFALLS = "- P1: a (#1).\n- P2: b (#2).\n- P10: c (#3).\n"


class ParsePitfalls(unittest.TestCase):
    def test_reads_ids_in_order(self):
        self.assertEqual(parse_pitfalls(PITFALLS), ["P1", "P2", "P10"])

    def test_no_file_means_no_ids(self):
        self.assertEqual(parse_pitfalls(""), [])

    def test_reads_scoped_pitfall_id(self):
        text = "P7: Missing transaction (#212) (paths: src/store/; for: implementor, reviewer)\n"
        ids = parse_pitfalls(text)
        self.assertEqual(ids, ["P7"])
        self.assertEqual(check_report("Pitfalls checked: P7\nPitfalls hit: none\n", ids, []), [])

    def test_reads_fixed_pitfall_id(self):
        text = "- P9: Uses a fixed port (#240) [fixed: #251]\n"
        ids = parse_pitfalls(text)
        self.assertEqual(ids, ["P9"])
        report = "Pitfalls checked: P9\nPitfalls hit: P9 (tests/server.py, setup)\n"
        self.assertEqual(check_report(report, ids, ["P9"]), [])


class CheckReport(unittest.TestCase):
    def test_with_file_passes_when_all_checked_and_hits_named(self):
        report = "Pitfalls checked: P1, P2, P10\nPitfalls hit: P2 (src/a.py)\n"
        self.assertEqual(check_report(report, ["P1", "P2", "P10"], ["P2"]), [])

    def test_with_file_fails_on_unchecked_id(self):
        report = "Pitfalls checked: P1, P2\nPitfalls hit: none\n"
        errors = check_report(report, ["P1", "P2", "P10"], [])
        self.assertTrue(any("P10" in e for e in errors))

    def test_with_file_fails_on_missed_hit(self):
        report = "Pitfalls checked: P1, P2, P10\nPitfalls hit: none\n"
        errors = check_report(report, ["P1", "P2", "P10"], ["P1"])
        self.assertTrue(any("P1" in e for e in errors))

    def test_with_file_fails_on_false_hit(self):
        report = "Pitfalls checked: P1, P2, P10\nPitfalls hit: P1\n"
        errors = check_report(report, ["P1", "P2", "P10"], [])
        self.assertTrue(any("P1" in e for e in errors))

    def test_with_file_fails_when_lines_missing(self):
        self.assertTrue(check_report("All fine.\n", ["P1"], []))

    def test_without_file_passes_with_no_pitfall_lines(self):
        self.assertEqual(check_report("Standards: none\n", [], []), [])

    def test_without_file_fails_on_pitfall_lines(self):
        self.assertTrue(check_report("Pitfalls checked: P1\n", [], []))


if __name__ == "__main__":
    unittest.main()
