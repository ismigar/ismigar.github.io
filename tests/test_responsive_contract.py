"""Static contract tests for the public site's responsive shell."""

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
LOCALIZED_PAGES = {
    "index.html": "Open navigation",
    "index.ca.html": "Obre la navegació",
    "index.es.html": "Abrir la navegación",
}


class ResponsiveContractTests(unittest.TestCase):
    """Protect the shared mobile navigation and fluid layout primitives."""

    def test_localized_pages_share_accessible_mobile_navigation(self):
        for filename, accessible_name in LOCALIZED_PAGES.items():
            source = (ROOT / filename).read_text(encoding="utf-8")
            with self.subTest(filename=filename):
                self.assertIn('src="navigation.js" defer', source)
                self.assertIn('class="nav-toggle"', source)
                self.assertIn('aria-expanded="false"', source)
                self.assertIn('aria-controls="site-navigation"', source)
                self.assertIn(f'aria-label="{accessible_name}"', source)
                self.assertIn('id="site-navigation"', source)

    def test_navigation_script_supports_keyboard_and_viewport_changes(self):
        source = (ROOT / "navigation.js").read_text(encoding="utf-8")

        self.assertIn('event.key === "Escape"', source)
        self.assertIn('matchMedia("(min-width: 769px)")', source)
        self.assertIn('toggle.setAttribute("aria-expanded"', source)

    def test_styles_define_fluid_grids_and_touch_targets(self):
        source = (ROOT / "styles.css").read_text(encoding="utf-8")

        self.assertIn("minmax(min(100%, 18rem), 1fr)", source)
        self.assertIn("min-height: 44px", source)
        self.assertIn("max-height: calc(100dvh - 72px)", source)
        self.assertIn("@media (prefers-reduced-motion: reduce)", source)


if __name__ == "__main__":
    unittest.main()
