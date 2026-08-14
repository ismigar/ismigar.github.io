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
                self.assertIn('href="shell.css"', source)
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
        page_styles = (ROOT / "styles.css").read_text(encoding="utf-8")
        shell_styles = (ROOT / "shell.css").read_text(encoding="utf-8")

        self.assertIn("minmax(min(100%, 18rem), 1fr)", page_styles)
        self.assertIn("--gnosi-shell-width: 1100px", shell_styles)
        self.assertIn("min-height: 44px", shell_styles)
        self.assertIn("max-height: calc(100dvh - 78px)", shell_styles)
        self.assertIn("@media (prefers-reduced-motion: reduce)", shell_styles)

    def test_locales_share_language_order_and_active_state_contract(self):
        for filename, locale in (
            ("index.html", "EN"),
            ("index.ca.html", "CA"),
            ("index.es.html", "ES"),
        ):
            source = (ROOT / filename).read_text(encoding="utf-8")
            language_menu = source.split('<div class="lang-switch"', 1)[1].split(
                "</div>", 1
            )[0]
            with self.subTest(filename=filename):
                self.assertLess(language_menu.index("EN"), language_menu.index("CA"))
                self.assertLess(language_menu.index("CA"), language_menu.index("ES"))
                self.assertIn(
                    f'<span class="active" aria-current="true">{locale}</span>',
                    language_menu,
                )

    def test_research_first_download_contract_is_localized(self):
        expected_headlines = {
            "index.html": "From source to manuscript, with your knowledge always yours.",
            "index.ca.html": "De la font al manuscrit, amb el coneixement sempre teu.",
            "index.es.html": "De la fuente al manuscrito, con el conocimiento siempre tuyo.",
        }

        for filename, headline in expected_headlines.items():
            source = (ROOT / filename).read_text(encoding="utf-8")
            locale = "en" if filename == "index.html" else filename[6:8]
            with self.subTest(filename=filename):
                self.assertIn(f"<h1>{headline}</h1>", source)
                self.assertIn('href="#workflow"', source)
                self.assertIn('href="#download"', source)
                self.assertIn('id="community"', source)
                self.assertIn('releases/latest?utm_source=gnosi-site', source)
                self.assertIn('data-download-kind="desktop"', source)
                self.assertIn(f'data-locale="{locale}"', source)
                self.assertLess(
                    source.index('class="download-card featured"'),
                    source.index("docker compose up -d --build"),
                )

    def test_analytics_distinguishes_desktop_downloads(self):
        source = (ROOT / "analytics.js").read_text(encoding="utf-8")

        self.assertIn("link.dataset.downloadKind === 'desktop'", source)
        self.assertIn("eventName = 'desktop_download_click'", source)
        self.assertIn("content_locale", source)

    def test_navigation_tracks_the_visible_section(self):
        source = (ROOT / "navigation.js").read_text(encoding="utf-8")

        self.assertIn("IntersectionObserver", source)
        self.assertIn('link.classList.toggle("active"', source)
        self.assertIn('link.setAttribute("aria-current", "page")', source)


if __name__ == "__main__":
    unittest.main()
