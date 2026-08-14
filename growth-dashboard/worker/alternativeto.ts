import type { AlternativeToMetrics } from './types';

export const ALTERNATIVETO_PARSER_VERSION = '2026-07-28.1';

function numberFrom(patterns: RegExp[], html: string): number {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      const value = Number(match[1].replace(',', '.'));
      if (Number.isFinite(value)) return value;
    }
  }
  return 0;
}

export function parseAlternativeTo(html: string): AlternativeToMetrics {
  const normalized = html.replace(/\s+/g, ' ');
  const hasProductMarker =
    /Gnosi/i.test(normalized) &&
    /AlternativeTo|software\/gnosi--your-digital-second-brain/i.test(normalized);
  if (!hasProductMarker) {
    throw new Error('AlternativeTo product markers were not found');
  }

  const likes = numberFrom(
    [
      /(?:aria-label|title)=["'][^"']*?(\d+)\s+likes?/i,
      /(\d+)\s+likes?/i,
      /"likesCount"\s*:\s*(\d+)/i,
    ],
    normalized,
  );
  const comments = numberFrom(
    [/(\d+)\s+comments?/i, /"commentsCount"\s*:\s*(\d+)/i],
    normalized,
  );
  const reviews = numberFrom(
    [/(\d+)\s+reviews?/i, /"reviewCount"\s*:\s*"?(\d+)/i],
    normalized,
  );
  const rating = numberFrom(
    [
      /"ratingValue"\s*:\s*"?(\d+(?:\.\d+)?)/i,
      /(\d+(?:\.\d+)?)\s*(?:out of 5|\/\s*5)/i,
    ],
    normalized,
  );

  return { likes, comments, reviews, rating, parserVersion: ALTERNATIVETO_PARSER_VERSION };
}

export function extractPlatform(assetName: string): string {
  const name = assetName.toLowerCase();
  if (name.includes('mac') || name.includes('darwin') || name.endsWith('.dmg')) return 'macOS';
  if (name.includes('win') || name.endsWith('.exe') || name.endsWith('.msi')) return 'Windows';
  if (name.includes('linux') || name.endsWith('.appimage') || name.endsWith('.deb') || name.endsWith('.rpm')) return 'Linux';
  if (name.includes('clipper')) return 'Web Clipper';
  if (name.endsWith('.oxt')) return 'LibreOffice';
  if (name.includes('word') || name.endsWith('.xml')) return 'Microsoft Word';
  return 'Other';
}
