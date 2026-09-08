const API = 'https://api.github.com/repos/ismigar/Gnosi/releases';
const SOURCE = 'https://raw.githubusercontent.com/ismigar/Gnosi/main/frontend/';
const SECTIONS = ['highlights', 'improvements', 'fixes'];

export function publishedReleases(releases) {
  return releases.filter(release => !release.draft
    && /^\d{4}-\d{2}-\d{2}T/.test(release.published_at ?? '')
    && /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(release.tag_name ?? '')
    && release.html_url === `https://github.com/ismigar/Gnosi/releases/tag/${release.tag_name}`)
    .sort((a, b) => b.published_at.localeCompare(a.published_at));
}

function translate(catalog, key) {
  return key.split('.').reduce((value, segment) => value?.[segment], catalog);
}

export function localizedRelease(release, catalog, translation) {
  const version = release.tag_name.slice(1);
  const notes = catalog.find(entry => entry.version === version);
  return {
    version, date: release.published_at.slice(0, 10), url: release.html_url,
    channel: release.prerelease || version.includes('-') ? 'prerelease' : 'stable',
    sections: Object.fromEntries(SECTIONS.map(section => [section,
      (notes?.sections?.[section] ?? []).map(key => translate(translation, key)).filter(value => typeof value === 'string'),
    ])),
  };
}

async function getJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, { signal: controller.signal, credentials: 'omit' });
    if (!response.ok) throw new Error('Release history unavailable');
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function releaseCard(release, labels) {
  const card = element('article', 'release-card');
  card.id = `v${release.version}`;
  const meta = element('div', 'release-meta');
  const title = element('div', 'release-title');
  const heading = element('h2', '');
  const permalink = element('a', '', `Gnosi v${release.version}`);
  permalink.href = `#${encodeURIComponent(card.id)}`;
  heading.append(permalink);
  title.append(heading, element('span', 'release-badge', labels[release.channel]));
  const date = element('time', 'release-date', release.date);
  date.dateTime = release.date;
  meta.append(title, date);
  const sections = element('div', 'section-grid');
  for (const section of SECTIONS) {
    if (!release.sections[section].length) continue;
    const box = element('section', 'section-box');
    const list = element('ul', '');
    list.append(...release.sections[section].map(text => element('li', '', text)));
    box.append(element('h3', '', labels[section]), list);
    sections.append(box);
  }
  const downloads = element('p', 'release-link');
  const link = element('a', '', labels.download);
  link.href = release.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  downloads.append(link);
  card.append(meta, sections, downloads);
  return card;
}

async function refreshHistory() {
  const container = document.getElementById('release-history');
  if (!container) return;
  const releases = [];
  for (let page = 1; page <= 100; page += 1) {
    const batch = await getJson(`${API}?per_page=100&page=${page}`);
    if (!Array.isArray(batch)) return;
    releases.push(...batch);
    if (batch.length < 100) break;
    if (page === 100) return;
  }
  const published = publishedReleases(releases);
  // A failed/empty feed must never erase the readable offline snapshot.
  if (!published.length) return;
  const existing = [...container.querySelectorAll('.release-card')].map(card => card.id).sort();
  const incoming = published.map(release => release.tag_name).sort();
  if (JSON.stringify(existing) === JSON.stringify(incoming)) return;

  const locale = ['ca', 'es'].includes(document.documentElement.lang) ? document.documentElement.lang : 'en';
  const [catalog, translation, snapshot] = await Promise.all([
    getJson(`${SOURCE}src/features/control-center/releases/releases.json`),
    getJson(`${SOURCE}src/shared/i18n/locales/${locale}/translation.json`),
    getJson('data/release-history.json'),
  ]);
  const cards = published.map(release => releaseCard(localizedRelease(release, catalog, translation), snapshot.labels[locale]));
  container.replaceChildren(...cards);
  const id = decodeURIComponent(location.hash.slice(1));
  if (id) document.getElementById(id)?.scrollIntoView({ block: 'start' });
}

// A rate limit, offline session or upstream failure leaves the static history intact.
if (typeof document !== 'undefined') void refreshHistory().catch(() => {});
