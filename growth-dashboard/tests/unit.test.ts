import { describe, expect, it } from 'vitest';
import { extractPlatform, parseAlternativeTo } from '../worker/alternativeto';
import { csvRows } from '../worker/index';
import { buildDashboard, calculateAssetDeltas } from '../worker/metrics';
import {
  createOAuthStateCookie,
  createSessionCookie,
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
    ];
    const dashboard = buildDashboard(
      currentRows,
      [],
      [],
      new Map(),
      [],
      [{ source: 'github', status: 'healthy', last_success_at: '2026-07-28T12:00:00Z', message: '' }],
      '2026-07-27',
      '2026-07-28',
      '2026-07-25',
      '2026-07-26',
    );

    expect(dashboard.funnel[1].value).toBe(31);
    expect(dashboard.funnel[2]).toMatchObject({
      value: 3,
      detail: 'Finestra mòbil de 14 dies',
    });
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
