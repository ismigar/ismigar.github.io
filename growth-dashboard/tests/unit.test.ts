import { describe, expect, it } from 'vitest';
import { translationKeyParity } from '../src/i18n';
import { normalizeDashboardData } from '../src/normalize';
import { extractPlatform, parseAlternativeTo } from '../worker/alternativeto';
import worker, { csvRows } from '../worker/index';
import {
  buildDashboard,
  calculateAssetDeltas,
  classifyReleaseAsset,
} from '../worker/metrics';
import { normalizeAlternativeToSnapshot } from '../worker/sync';
import {
  createOAuthStateCookie,
  createSessionCookie,
  createSessionToken,
  readSession,
  verifyOAuthState,
  verifyWebhookSignature,
} from '../worker/security';

describe('AlternativeTo parser', () => {
  it('extracts public product signals from JSON-LD and visible text', () => {
    const html = `
      <html><title>Gnosi | AlternativeTo</title>
      <script type="application/ld+json">
        {"name":"Gnosi","aggregateRating":{"ratingValue":"4.8","reviewCount":"7"},"likesCount":21}
      </script>
      <div>4 comments</div>
      <a href="/software/gnosi--your-digital-second-brain-/about/">Gnosi</a>
      </html>`;
    expect(parseAlternativeTo(html)).toMatchObject({
      likes: 21,
      comments: 4,
      reviews: 7,
      rating: 4.8,
    });
  });

  it('fails closed when the product markers disappear', () => {
    expect(() => parseAlternativeTo('<html>Unrelated page</html>')).toThrow(
      'product markers',
    );
  });

  it('extracts a Jina Reader snapshot of the public product page', () => {
    const markdown = `
      Title: Gnosi: A local-first, open-source workspace
      URL Source: https://alternativeto.net/software/gnosi--your-digital-second-brain-/about/
      Markdown Content:
      1 like 1 like
      No comments or reviews, maybe you want to be first?
    `;
    expect(parseAlternativeTo(markdown)).toMatchObject({
      likes: 1,
      comments: 0,
      reviews: 0,
      rating: 0,
    });
  });

  it('normalizes a manual snapshot and rejects invalid counters', () => {
    expect(
      normalizeAlternativeToSnapshot({ likes: 1, comments: 0, reviews: 0, rating: 0 }),
    ).toEqual({ likes: 1, comments: 0, reviews: 0, rating: 0 });
    expect(() =>
      normalizeAlternativeToSnapshot({ likes: -1, comments: 0, reviews: 0, rating: 0 }),
    ).toThrow('Invalid AlternativeTo likes');
    expect(() =>
      normalizeAlternativeToSnapshot({ likes: 1, comments: 0, reviews: 0, rating: 6 }),
    ).toThrow('Invalid AlternativeTo rating');
  });
});

describe('release asset deltas', () => {
  it('uses the first counter as a baseline and tolerates counter resets', () => {
    const deltas = calculateAssetDeltas([
      { asset_id: 1, release_tag: 'v1', asset_name: 'Gnosi.dmg', captured_at: '2026-07-01T00:00:00Z', period_date: '2026-07-01', download_count: 10 },
      { asset_id: 1, release_tag: 'v1', asset_name: 'Gnosi.dmg', captured_at: '2026-07-02T00:00:00Z', period_date: '2026-07-02', download_count: 14 },
      { asset_id: 1, release_tag: 'v1', asset_name: 'Gnosi.dmg', captured_at: '2026-07-03T00:00:00Z', period_date: '2026-07-03', download_count: 2 },
    ]);
    expect(deltas.map((row) => row.delta)).toEqual([0, 4, 0]);
  });

  it('classifies common release assets', () => {
    expect(extractPlatform('Gnosi-arm64.dmg')).toBe('macOS');
    expect(extractPlatform('Gnosi-Setup.exe')).toBe('Windows');
    expect(extractPlatform('gnosi-cite.oxt')).toBe('LibreOffice');
    expect(classifyReleaseAsset('Gnosi-1.0.0-arm64.dmg')).toBe('installer');
    expect(classifyReleaseAsset('Gnosi-1.0.0-mac.zip')).toBe('installer');
    expect(classifyReleaseAsset('gnosi-cite.oxt')).toBe('connector');
    expect(classifyReleaseAsset('gnosi-word-addin-manifest.xml')).toBe('connector');
    expect(classifyReleaseAsset('latest-mac.yml')).toBe('updater');
    expect(classifyReleaseAsset('Gnosi-1.0.0.dmg.blockmap')).toBe('updater');
    expect(classifyReleaseAsset('checksums.txt')).toBe('other');
  });

  it('separates installer, connector, updater, and other download totals', () => {
    const assets = [
      [1, 'Gnosi-1.0.0.dmg', 10, 14],
      [2, 'latest-mac.yml', 8, 9],
      [3, 'gnosi-cite.oxt', 4, 6],
      [4, 'checksums.txt', 1, 2],
    ].flatMap(([assetId, assetName, first, second]) => [
      { asset_id: Number(assetId), release_tag: 'v1.0.0', asset_name: String(assetName), captured_at: '2026-07-01T00:00:00Z', period_date: '2026-07-01', download_count: Number(first) },
      { asset_id: Number(assetId), release_tag: 'v1.0.0', asset_name: String(assetName), captured_at: '2026-07-02T00:00:00Z', period_date: '2026-07-02', download_count: Number(second) },
    ]);
    const dashboard = buildDashboard(
      [],
      [],
      assets,
      new Map(),
      [],
      [{ source: 'github', status: 'healthy', last_success_at: '2026-07-02T12:00:00Z', message: '' }],
      '2026-07-01',
      '2026-07-02',
      '2026-06-29',
      '2026-06-30',
    );

    expect(dashboard.downloads).toMatchObject({
      totalAssetDownloads: 31,
      newAssetDownloadsInPeriod: 8,
      installerDownloads: 14,
      newInstallerDownloadsInPeriod: 4,
      connectorDownloads: 6,
      updaterDownloads: 9,
      otherDownloads: 2,
    });
    expect(dashboard.downloads.byInstallerPlatform).toEqual([
      { label: 'macOS', value: 14 },
    ]);
    expect(dashboard.journey[3]).toEqual({ id: 'downloads', value: 4 });
    expect(dashboard.timeline.map((point) => point.downloads)).toEqual([0, 4]);
  });
});

describe('dashboard localization', () => {
  it('keeps Catalan, Spanish, and English keys in parity', () => {
    expect(translationKeyParity()).toEqual([]);
  });
});

describe('dashboard response compatibility', () => {
  it('reconstructs the journey when an older worker response omits it', () => {
    const normalized = normalizeDashboardData({
      range: { from: '2026-08-01', to: '2026-08-14' },
      timeline: [],
      downloads: {
        installerDownloads: 5,
        newInstallerDownloadsInPeriod: 2,
        byVersion: [],
        byInstallerPlatform: [],
        byAsset: [],
      },
      community: {},
      alternativeTo: { outbound: 7 },
      sponsors: {},
      sources: [],
    });

    expect(normalized.journey).toEqual([
      { id: 'alternativeto', value: 7 },
      { id: 'repository', value: null },
      { id: 'releases', value: null },
      { id: 'downloads', value: 2 },
    ]);
    expect(normalized.downloads.downloadIntentClicks).toBe(0);
    expect(normalized.downloads.installerLinkClicks).toBe(0);
  });

  it('rejects unrelated API error payloads instead of rendering false zeros', () => {
    expect(() => normalizeDashboardData({ error: 'unauthorized' })).toThrow(
      'incompatible response',
    );
  });
});

describe('GitHub traffic semantics', () => {
  it('uses total daily repository views and the latest rolling release snapshot', () => {
    const currentRows = [
      { source: 'github', metric: 'repository_views', dimension: 'total', period_date: '2026-07-27', value: 20 },
      { source: 'github', metric: 'repository_unique_visitors', dimension: 'unique', period_date: '2026-07-27', value: 5 },
      { source: 'github', metric: 'repository_views', dimension: 'total', period_date: '2026-07-28', value: 11 },
      { source: 'github', metric: 'repository_unique_visitors', dimension: 'unique', period_date: '2026-07-28', value: 4 },
      { source: 'github', metric: 'release_views_14d', dimension: 'total', period_date: '2026-07-27', value: 2 },
      { source: 'github', metric: 'release_views_14d', dimension: 'total', period_date: '2026-07-28', value: 3 },
      { source: 'github', metric: 'alternativeto_github_views_14d', dimension: 'total', period_date: '2026-07-28', value: 2 },
    ];
    const dashboard = buildDashboard(
      currentRows,
      [],
      [],
      new Map([['2026-07-28', 1]]),
      [],
      [{ source: 'github', status: 'healthy', last_success_at: '2026-07-28T12:00:00Z', message: '' }],
      '2026-07-27',
      '2026-07-28',
      '2026-07-25',
      '2026-07-26',
    );

    expect(dashboard.journey[1]).toEqual({ id: 'repository', value: 2 });
    expect(dashboard.journey[2]).toEqual({ id: 'releases', value: 3 });
    expect(dashboard.comparison.repositoryViews).toBe(100);
    expect(dashboard.timeline.map((point) => point.releaseViews)).toEqual([2, 3]);
  });
});

describe('sponsor imports and webhook security', () => {
  it('reads a simple GitHub Sponsors CSV export', () => {
    const rows = csvRows(
      'sponsor,created_at,monthly_amount_in_cents,metadata_source\nalice,2026-07-02T10:00:00Z,500,alternativeto',
    );
    expect(rows).toEqual([
      {
        sponsor: 'alice',
        created_at: '2026-07-02T10:00:00Z',
        monthly_amount_in_cents: '500',
        metadata_source: 'alternativeto',
      },
    ]);
  });

  it('accepts only the matching HMAC signature', async () => {
    const body = '{"action":"created"}';
    const secret = 'test-secret';
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(body),
    );
    const hex = Array.from(new Uint8Array(signature))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    await expect(verifyWebhookSignature(body, `sha256=${hex}`, secret)).resolves.toBe(true);
    await expect(verifyWebhookSignature(`${body}x`, `sha256=${hex}`, secret)).resolves.toBe(false);
  });
});

describe('dashboard authentication', () => {
  it('accepts a valid signed GitHub session and rejects tampering or expiry', async () => {
    const secret = 'session-secret-with-enough-entropy';
    const cookie = await createSessionCookie('ismigar', 42, secret, 1_000_000);
    const request = new Request('https://growth.example.test/', {
      headers: { Cookie: cookie.split(';')[0] },
    });
    await expect(readSession(request, secret, 1_000_001)).resolves.toMatchObject({
      login: 'ismigar',
      id: 42,
    });
    const tampered = new Request('https://growth.example.test/', {
      headers: { Cookie: cookie.split(';')[0].replace('gnosi_growth_session=', 'gnosi_growth_session=x') },
    });
    await expect(readSession(tampered, secret, 1_000_001)).resolves.toBeNull();
    await expect(readSession(request, secret, 1_000_000 + 8 * 60 * 60 * 1000)).resolves.toBeNull();
  });

  it('accepts a signed bearer session for the GitHub Pages shell', async () => {
    const secret = 'session-secret-with-enough-entropy';
    const token = await createSessionToken('ismigar', 42, secret, 1_000_000);
    const request = new Request('https://growth.example.test/api/dashboard', {
      headers: { Authorization: `Bearer ${token}` },
    });
    await expect(readSession(request, secret, 1_000_001)).resolves.toMatchObject({
      login: 'ismigar',
      id: 42,
    });
  });

  it('allows only the configured public dashboard origin through CORS', async () => {
    const env = {
      DASHBOARD_PUBLIC_URL: 'https://gnosi.temenosismael.org/dashboard/',
    } as never;
    const allowed = await worker.fetch(
      new Request('https://growth.example.test/api/dashboard', {
        method: 'OPTIONS',
        headers: { Origin: 'https://gnosi.temenosismael.org' },
      }),
      env,
    );
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://gnosi.temenosismael.org',
    );

    const denied = await worker.fetch(
      new Request('https://growth.example.test/api/dashboard', {
        method: 'OPTIONS',
        headers: { Origin: 'https://example.com' },
      }),
      env,
    );
    expect(denied.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('binds the public dashboard return target into signed OAuth state', async () => {
    const dashboardUrl = 'https://gnosi.temenosismael.org/dashboard/';
    const response = await worker.fetch(
      new Request(
        `https://growth.example.test/auth/login?return_to=${encodeURIComponent(dashboardUrl)}`,
      ),
      {
        GITHUB_OAUTH_CLIENT_ID: 'client-id',
        GITHUB_OAUTH_CLIENT_SECRET: 'client-secret',
        GITHUB_ALLOWED_LOGIN: 'ismigar',
        SESSION_SECRET: 'session-secret-with-enough-entropy',
        DASHBOARD_PUBLIC_URL: dashboardUrl,
      } as never,
    );
    const location = new URL(response.headers.get('Location')!);
    expect(location.hostname).toBe('github.com');
    expect(location.searchParams.get('state')).toMatch(/_public$/);
    expect(location.searchParams.get('redirect_uri')).toBe(
      'https://growth.example.test/auth/callback',
    );
  });

  it('binds the OAuth callback state to a signed short-lived cookie', async () => {
    const secret = 'session-secret-with-enough-entropy';
    const cookie = await createOAuthStateCookie('expected-state', secret);
    const request = new Request('https://growth.example.test/auth/callback', {
      headers: { Cookie: cookie.split(';')[0] },
    });
    await expect(verifyOAuthState(request, 'expected-state', secret)).resolves.toBe(true);
    await expect(verifyOAuthState(request, 'different-state', secret)).resolves.toBe(false);
  });
});
