#!/usr/bin/env python3
"""Render public history from Gnosi's localized catalog and published GitHub releases.

Run --source ../Gnosi to use a local checkout. Without --source, use upstream
main. --check renders the saved snapshot without network access (for site CI).
"""
from __future__ import annotations

import argparse
from datetime import datetime
from html import escape
import json
from pathlib import Path
import re
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / 'data/release-history.json'
CATALOG = 'frontend/src/features/control-center/releases/releases.json'
BASE = 'https://raw.githubusercontent.com/ismigar/Gnosi/main/'
API = 'https://api.github.com/repos/ismigar/Gnosi/releases'
LOCALES = ('en', 'ca', 'es')
SECTIONS = ('highlights', 'improvements', 'fixes')
START = '<!-- release-history:start -->'
END = '<!-- release-history:end -->'


def fetch_json(url):
    request = Request(url, headers={'User-Agent': 'Gnosi-release-history', 'Accept': 'application/json'})
    with urlopen(request, timeout=30) as response:
        return json.load(response)


def read_source(source, path):
    if source:
        return json.loads((source / path).read_text(encoding='utf-8'))
    return fetch_json(BASE + path)


def translation(catalog, key):
    value = catalog
    for segment in key.split('.'):
        value = value[segment]
    if not isinstance(value, str):
        raise ValueError(f'Missing translation: {key}')
    return value


def public_history(catalog, translations, published):
    notes = {entry['version']: entry for entry in catalog}
    result = []
    for release in published:
        tag = release.get('tag_name', '')
        if release.get('draft') or not release.get('published_at') or not re.fullmatch(
            r'v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?', tag
        ):
            continue
        url = f'https://github.com/ismigar/Gnosi/releases/tag/{tag}'
        if release.get('html_url') != url:
            raise ValueError(f'Unexpected release URL: {release.get("html_url")}')
        version = tag[1:]
        entry = notes.get(version)
        date = release['published_at'][:10]
        datetime.strptime(date, '%Y-%m-%d')
        result.append({
            'version': version, 'date': date, 'url': url,
            'channel': 'prerelease' if release.get('prerelease') or '-' in version else 'stable',
            'sections': {locale: {
                section: [translation(translations[locale], key) for key in entry['sections'][section]]
                if entry else [] for section in SECTIONS
            } for locale in LOCALES},
        })
    # Follow actual publication dates; a stable release and its RC can share a date.
    result.sort(key=lambda entry: entry['date'], reverse=True)
    if not result:
        raise ValueError('Refusing to replace the history with an empty publication list')
    labels = {locale: {
        section: translation(translations[locale], f'release_notes.section_{section}')
        for section in SECTIONS
    } | {
        channel: translation(translations[locale], f'release_notes.channel_{channel}')
        for channel in ('stable', 'prerelease')
    } | {'download': translation(translations[locale], 'release_notes.download_version')}
        for locale in LOCALES}
    return {'labels': labels, 'releases': result}


def render(history, locale):
    labels = history['labels'][locale]
    cards = []
    for release in history['releases']:
        version = escape(release['version'], quote=True)
        sections = []
        for section in SECTIONS:
            items = release['sections'][locale][section]
            if items:
                sections.append(f'<section class="section-box"><h3>{escape(labels[section])}</h3><ul>'
                                + ''.join(f'<li>{escape(item)}</li>' for item in items) + '</ul></section>')
        cards.append(f'''      <article class="release-card" id="v{version}">
        <div class="release-meta">
          <div class="release-title"><h2><a href="#v{version}">Gnosi v{version}</a></h2><span class="release-badge">{escape(labels[release['channel']])}</span></div>
          <time class="release-date" datetime="{release['date']}">{release['date']}</time>
        </div>
        <div class="section-grid">{''.join(sections)}</div>
        <p class="release-link"><a href="{escape(release['url'], quote=True)}" target="_blank" rel="noopener noreferrer">{escape(labels['download'])}</a></p>
      </article>''')
    return '\n\n'.join(cards)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path)
    parser.add_argument('--published', type=Path, help='Saved GitHub API response for offline generation')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    if args.check:
        history = json.loads(SNAPSHOT.read_text(encoding='utf-8'))
    else:
        if args.published:
            published = json.loads(args.published.read_text(encoding='utf-8'))
        else:
            published = []
            for page in range(1, 101):
                batch = fetch_json(f'{API}?per_page=100&page={page}')
                published.extend(batch)
                if len(batch) < 100:
                    break
            else:
                raise ValueError('Release pagination did not finish')
        catalog = read_source(args.source, CATALOG)
        translations = {locale: read_source(args.source, f'frontend/src/shared/i18n/locales/{locale}/translation.json') for locale in LOCALES}
        history = public_history(catalog, translations, published)
    outputs = {}
    for locale in LOCALES:
        suffix = '' if locale == 'en' else f'.{locale}'
        path = ROOT / f'changelog{suffix}.html'
        source = path.read_text(encoding='utf-8')
        before, rest = source.split(START, 1)
        _, after = rest.split(END, 1)
        expected = before + START + '\n' + render(history, locale) + '\n      ' + END + after
        if args.check and source != expected:
            raise ValueError(f'{path.name} is not synchronized with the release snapshot')
        outputs[path] = expected
    if not args.check:
        SNAPSHOT.write_text(json.dumps(history, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        for path, output in outputs.items():
            path.write_text(output, encoding='utf-8')
    print(f'Public history verified: {len(history["releases"])} versions, {len(LOCALES)} languages.')


if __name__ == '__main__':
    main()
