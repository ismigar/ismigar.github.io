import assert from 'node:assert/strict';
import test from 'node:test';
import { localizedRelease, publishedReleases } from '../release-history.mjs';

const release = (tag, options = {}) => ({ tag_name: tag, html_url: `https://github.com/ismigar/Gnosi/releases/tag/${tag}`, published_at: '2026-09-08T12:00:00Z', draft: false, ...options });

test('live refresh excludes drafts, non-app packages and untrusted URLs', () => {
  const entries = publishedReleases([release('v2.0.6'), release('v3.0.0', { draft: true }), release('plugins-v0.1.0'), release('v1.0.0', { html_url: 'javascript:alert(1)' }), release('v3.1.0', { published_at: null })]);
  assert.deepEqual(entries.map(entry => entry.tag_name), ['v2.0.6']);
});

test('a new release uses localized catalog notes and preserves prerelease status', () => {
  const entry = localizedRelease(release('v3.0.1-rc.1'), [{ version: '3.0.1-rc.1', sections: { highlights: ['notes.first'] } }], { notes: { first: 'Canvis en català' } });
  assert.deepEqual(entry.sections.highlights, ['Canvis en català']);
  assert.equal(entry.channel, 'prerelease');
});

test('a publication without catalog notes still links to its own release', () => {
  const entry = localizedRelease(release('v3.0.1'), [], {});
  assert.equal(entry.url, 'https://github.com/ismigar/Gnosi/releases/tag/v3.0.1');
  assert.deepEqual(entry.sections, { highlights: [], improvements: [], fixes: [] });
});
