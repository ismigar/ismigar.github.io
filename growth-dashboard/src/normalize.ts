import type { DashboardData, JourneyStep, TimelinePoint } from './types';

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};

const asNumber = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const asNullableNumber = (value: unknown): number | null =>
  value === null ? null : asNumber(value);

const asString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const normalizeBars = (value: unknown): Array<{ label: string; value: number }> =>
  Array.isArray(value)
    ? value.map((item) => {
        const row = asRecord(item);
        return { label: asString(row.label), value: asNumber(row.value) };
      }).filter((item) => item.label)
    : [];

const normalizeRecord = (
  value: unknown,
  keys: readonly string[],
): Record<string, number> => {
  const row = asRecord(value);
  return Object.fromEntries(keys.map((key) => [key, asNumber(row[key])]));
};

export function normalizeDashboardData(value: unknown): DashboardData {
  const root = asRecord(value);
  if (!root.downloads || !root.community || !Array.isArray(root.timeline)) {
    throw new Error('The dashboard API returned an incompatible response.');
  }

  const range = asRecord(root.range);
  const downloads = asRecord(root.downloads);
  const alternativeTo = asRecord(root.alternativeTo);
  const fallbackJourney: JourneyStep[] = [
    { id: 'alternativeto', value: asNumber(alternativeTo.outbound) },
    { id: 'repository', value: null },
    { id: 'releases', value: null },
    { id: 'downloads', value: asNumber(downloads.newInstallerDownloadsInPeriod) },
  ];
  const journey = Array.isArray(root.journey)
    ? root.journey.map((item) => {
        const row = asRecord(item);
        return {
          id: asString(row.id, 'unknown'),
          value: asNullableNumber(row.value),
        };
      })
    : fallbackJourney;

  const timeline: TimelinePoint[] = root.timeline.map((item) => {
    const row = asRecord(item);
    return {
      date: asString(row.date),
      redirects: asNumber(row.redirects),
      repositoryViews: asNumber(row.repositoryViews),
      releaseViews: asNumber(row.releaseViews),
      downloads: asNumber(row.downloads),
      stars: asNumber(row.stars),
      issues: asNumber(row.issues),
      pullRequests: asNumber(row.pullRequests),
      sponsors: asNumber(row.sponsors),
    };
  }).filter((item) => item.date);

  const sources = Array.isArray(root.sources)
    ? root.sources.map((item) => {
        const row = asRecord(item);
        return {
          id: asString(row.id),
          label: asString(row.label),
          status: asString(row.status, 'unknown'),
          lastSuccessAt: row.lastSuccessAt === null ? null : asString(row.lastSuccessAt) || null,
          message: asString(row.message),
        };
      }).filter((item) => item.id)
    : [];

  return {
    range: {
      from: asString(range.from),
      to: asString(range.to),
      previousFrom: asString(range.previousFrom),
      previousTo: asString(range.previousTo),
    },
    journey: journey.length ? journey : fallbackJourney,
    timeline,
    comparison: normalizeRecord(root.comparison, [
      'redirects',
      'repositoryViews',
      'releaseViews',
      'downloads',
    ]),
    downloads: {
      totalAssetDownloads: asNumber(downloads.totalAssetDownloads),
      newAssetDownloadsInPeriod: asNumber(downloads.newAssetDownloadsInPeriod),
      installerDownloads: asNumber(downloads.installerDownloads),
      newInstallerDownloadsInPeriod: asNumber(downloads.newInstallerDownloadsInPeriod),
      downloadIntentClicks: asNumber(downloads.downloadIntentClicks),
      installerLinkClicks: asNumber(downloads.installerLinkClicks),
      connectorDownloads: asNumber(downloads.connectorDownloads),
      updaterDownloads: asNumber(downloads.updaterDownloads),
      otherDownloads: asNumber(downloads.otherDownloads),
      byVersion: normalizeBars(downloads.byVersion),
      byInstallerPlatform: normalizeBars(downloads.byInstallerPlatform),
      byAsset: normalizeBars(downloads.byAsset),
    },
    community: normalizeRecord(root.community, [
      'stars',
      'forks',
      'issuesOpen',
      'issuesClosed',
      'pullRequestsCreated',
      'pullRequestsMerged',
      'medianIssueHours',
    ]),
    alternativeTo: normalizeRecord(root.alternativeTo, [
      'likes',
      'comments',
      'reviews',
      'rating',
    ]),
    sponsors: normalizeRecord(root.sponsors, [
      'active',
      'started',
      'cancelled',
      'mrr',
      'oneTimeRevenue',
      'fromAlternativeTo',
    ]),
    sources,
    generatedAt: asString(root.generatedAt, new Date().toISOString()),
  };
}
