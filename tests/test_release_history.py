"""Publication filtering and output safety for the localized history."""
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('history', ROOT / 'scripts/sync_release_history.py')
history = importlib.util.module_from_spec(spec)
spec.loader.exec_module(history)


def release(version, **kwargs):
    return {'tag_name': 'v' + version, 'html_url': 'https://github.com/ismigar/Gnosi/releases/tag/v' + version,
            'published_at': '2026-09-08T12:00:00Z', 'draft': False, 'prerelease': False, **kwargs}


def translations():
    return {locale: {'release_notes': {
        'section_highlights': 'Highlights', 'section_improvements': 'Improvements', 'section_fixes': 'Fixes',
        'channel_stable': 'Stable', 'channel_prerelease': 'Prerelease', 'download_version': 'Download',
    }, 'note': '<script>alert("unsafe")</script>'} for locale in history.LOCALES}


class ReleaseHistoryTests(unittest.TestCase):
    def test_drafts_unpublished_and_plugin_packages_are_not_announced(self):
        result = history.public_history([], translations(), [release('2.0.6'), release('3.0.0', draft=True),
            release('3.1.0', published_at=None), release('0.1.0', tag_name='plugins-v0.1.0')])
        self.assertEqual([entry['version'] for entry in result['releases']], ['2.0.6'])

    def test_notes_are_escaped_and_only_actual_release_links_are_used(self):
        catalog = [{'version': '2.0.6', 'sections': {'highlights': ['note'], 'improvements': [], 'fixes': []}}]
        result = history.public_history(catalog, translations(), [release('2.0.6')])
        rendered = history.render(result, 'ca')
        self.assertNotIn('<script>', rendered)
        self.assertIn('&lt;script&gt;', rendered)
        self.assertIn('id="v2.0.6"', rendered)
        self.assertIn('/releases/tag/v2.0.6', rendered)
        self.assertNotIn('.dmg', rendered)

    def test_missing_localized_notes_keep_the_published_release_link(self):
        result = history.public_history([], translations(), [release('0.1.1')])
        self.assertIn('Gnosi v0.1.1', history.render(result, 'es'))
        self.assertIn('/releases/tag/v0.1.1', history.render(result, 'es'))

    def test_empty_or_untrusted_feeds_cannot_overwrite_history(self):
        with self.assertRaises(ValueError):
            history.public_history([], translations(), [])
        with self.assertRaises(ValueError):
            history.public_history([], translations(), [release('2.0.6', html_url='https://example.test')])


if __name__ == '__main__':
    unittest.main()
