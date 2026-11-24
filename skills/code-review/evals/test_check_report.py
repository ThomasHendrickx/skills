import unittest
from check_report import parse_pitfalls, check_report

PITFALLS = "- P1: a (#1).\n- P2: b (#2).\n- P10: c (#3).\n"


class ParsePitfalls(unittest.TestCase):
    def test_reads_ids_in_order(self):
        self.assertEqual(parse_pitfalls(PITFALLS), ["P1", "P2", "P10"])

    def test_no_file_means_no_ids(self):
        self.assertEqual(parse_pitfalls(""), [])


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
