"""Tests for localized landing-page parity."""

from pathlib import Path
import sys
import unittest


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from check_locale_parity import validate_change_set, validate_structure  # noqa: E402


class LocaleParityTests(unittest.TestCase):
    """Protect structural and pull-request parity across all locales."""

    def test_current_pages_have_matching_semantic_structure(self):
        self.assertEqual(validate_structure(), [])

    def test_one_locale_change_requires_the_other_locales(self):
        errors = validate_change_set({"index.ca.html", "styles.css"})

        self.assertEqual(len(errors), 1)
        self.assertIn("index.html", errors[0])
        self.assertIn("index.es.html", errors[0])

    def test_all_locale_pages_can_change_together(self):
        self.assertEqual(
            validate_change_set({"index.html", "index.ca.html", "index.es.html"}),
            [],
        )

    def test_nonlocalized_changes_do_not_require_html_rewrites(self):
        self.assertEqual(validate_change_set({"styles.css", "navigation.js"}), [])


if __name__ == "__main__":
    unittest.main()
