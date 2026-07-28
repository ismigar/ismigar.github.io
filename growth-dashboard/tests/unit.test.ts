import { describe, expect, it } from 'vitest';
import { extractPlatform, parseAlternativeTo } from '../worker/alternativeto';
import { csvRows } from '../worker/index';
import { calculateAssetDeltas } from '../worker/metrics';
import { verifyWebhookSignature } from '../worker/security';

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
