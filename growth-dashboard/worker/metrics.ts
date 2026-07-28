import type { DashboardResponse, MetricPoint } from './types';
import { extractPlatform } from './alternativeto';

interface SnapshotRow {
  source: string;
  metric: string;
  dimension: string;
  period_date: string;
  value: number;
}

interface AssetRow {
  asset_id: number;
  release_tag: string;
  asset_name: string;
  captured_at: string;
  period_date: string;
  download_count: number;
}

function safePercent(current: number, previous: number): number {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function calculateAssetDeltas(rows: AssetRow[]) {
  const ordered = [...rows].sort((a, b) =>
    a.asset_id === b.asset_id
      ? a.captured_at.localeCompare(b.captured_at)
      : a.asset_id - b.asset_id,
  );
  const previous = new Map<number, number>();
  return ordered.map((row) => {
    const baseline = previous.get(row.asset_id);
    const delta = baseline === undefined ? 0 : Math.max(0, row.download_count - baseline);
    previous.set(row.asset_id, row.download_count);
    return { ...row, delta };
  });
}

function sumMetric(rows: SnapshotRow[], metric: string): number {
  return rows.filter((row) => row.metric === metric).reduce((sum, row) => sum + row.value, 0);
}

function sumMetricDimension(rows: SnapshotRow[], metric: string, dimension: string): number {
  return rows
    .filter((row) => row.metric === metric && row.dimension === dimension)
    .reduce((sum, row) => sum + row.value, 0);
}

function latestMetric(rows: SnapshotRow[], metric: string): number {
  const matching = rows.filter((row) => row.metric === metric);
  return matching.length ? matching.at(-1)!.value : 0;
}

export function buildDashboard(
  currentRows: SnapshotRow[],
  previousRows: SnapshotRow[],
  assets: AssetRow[],
  redirectsByDate: Map<string, number>,
  sponsorRows: Array<Record<string, string | number>>,
  syncRows: Array<Record<string, string | null>>,
  from: string,
  to: string,
  previousFrom: string,
  previousTo: string,
): DashboardResponse {
  const assetDeltas = calculateAssetDeltas(assets);
  const currentAssets = assetDeltas.filter((row) => row.period_date >= from && row.period_date <= to);
  const currentDownloads = currentAssets.reduce((sum, row) => sum + row.delta, 0);
  const latestAssetsById = new Map<number, AssetRow>();
  assets.forEach((row) => {
    const current = latestAssetsById.get(row.asset_id);
    if (!current || row.captured_at > current.captured_at) latestAssetsById.set(row.asset_id, row);
  });
  const latestAssets = [...latestAssetsById.values()];
  const lifetimeDownloads = latestAssets.reduce((sum, row) => sum + row.download_count, 0);
  const installerPattern = /\.(?:dmg|exe|msi|deb|appimage)$/i;
  const installerDownloads = latestAssets
    .filter((row) => installerPattern.test(row.asset_name))
    .reduce((sum, row) => sum + row.download_count, 0);
  const previousDownloads = assetDeltas
    .filter((row) => row.period_date >= previousFrom && row.period_date <= previousTo)
    .reduce((sum, row) => sum + row.delta, 0);

  const dates = new Set<string>();
  currentRows.forEach((row) => dates.add(row.period_date));
  currentAssets.forEach((row) => dates.add(row.period_date));
  redirectsByDate.forEach((_value, date) => dates.add(date));

  const timeline: MetricPoint[] = [...dates].sort().map((date) => {
    const dayRows = currentRows.filter((row) => row.period_date === date);
    return {
      date,
      redirects: redirectsByDate.get(date) ?? 0,
      repositoryViews: sumMetricDimension(dayRows, 'repository_views', 'total'),
      releaseViews: latestMetric(dayRows, 'release_views_14d'),
      downloads: currentAssets.filter((row) => row.period_date === date).reduce((sum, row) => sum + row.delta, 0),
      stars: latestMetric(dayRows, 'stars'),
      issues: sumMetric(dayRows, 'issues_created'),
      pullRequests: sumMetric(dayRows, 'pull_requests_created'),
      sponsors: sumMetric(dayRows, 'sponsors_started'),
    };
  });

  const redirects = [...redirectsByDate.values()].reduce((sum, value) => sum + value, 0);
  const totalRepositoryViews = sumMetricDimension(currentRows, 'repository_views', 'total');
  const alternativeToRepositoryViews = latestMetric(
    currentRows,
    'alternativeto_github_views_14d',
  );
  const releaseViews = latestMetric(currentRows, 'release_views_14d');
  const githubSync = syncRows.find((row) => String(row.source) === 'github');
  const trafficAvailable = !String(githubSync?.message ?? '').includes('required for traffic');
  const funnelValues = [
    { id: 'alternativeto', label: 'Clics des d’AlternativeTo', value: redirects },
    {
      id: 'repository',
      label: 'Visites GitHub des d’AlternativeTo',
      value: trafficAvailable ? alternativeToRepositoryViews : null,
      detail: trafficAvailable
        ? alternativeToRepositoryViews > redirects
          ? 'Inclou visites prèvies al redirect rastrejat · 14 dies'
          : 'Referidor GitHub · finestra mòbil de 14 dies'
        : 'Cal un token de trànsit',
    },
    {
      id: 'releases',
      label: 'Visites totals a releases',
      value: trafficAvailable ? releaseViews : null,
      detail: trafficAvailable
        ? 'Tot GitHub · finestra mòbil de 14 dies'
        : 'Dada no disponible',
    },
    {
      id: 'downloads',
      label: 'Noves descàrregues confirmades',
      value: currentDownloads,
      detail: lifetimeDownloads
        ? `${lifetimeDownloads} acumulades abans o durant el seguiment`
        : undefined,
    },
  ];
  const funnel = funnelValues.map((item, index) => ({
    ...item,
    conversion:
      index === 0 ||
      index > 1 ||
      item.value === null ||
      funnelValues[index - 1].value === null ||
      funnelValues[index - 1].value! <= 0 ||
      item.value > funnelValues[index - 1].value!
        ? null
        : Math.round((item.value / funnelValues[index - 1].value!) * 1000) / 10,
  }));

  const groupAssets = (key: (row: AssetRow) => string) => {
    const totals = new Map<string, number>();
    latestAssets.forEach((row) =>
      totals.set(key(row), (totals.get(key(row)) ?? 0) + row.download_count),
    );
    return [...totals]
      .map(([label, value]) => ({ label, value }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value);
  };

  const latestSponsors = new Map<string, Record<string, string | number>>();
  sponsorRows.forEach((row) => latestSponsors.set(String(row.sponsor_hash), row));
  const activeSponsors = [...latestSponsors.values()].filter((row) => Number(row.is_active) === 1);
  const periodSponsorRows = sponsorRows.filter((row) => {
    const date = String(row.occurred_at).slice(0, 10);
    return date >= from && date <= to;
  });
  const sponsorStarts = periodSponsorRows.filter((row) => row.action === 'created').length;
  const sponsorEnds = periodSponsorRows.filter((row) => row.action === 'cancelled').length;
  const oneTimeRevenue =
    periodSponsorRows.reduce((sum, row) => sum + Number(row.one_time_cents), 0) / 100;
  const mrr = activeSponsors.reduce((sum, row) => sum + Number(row.tier_cents), 0) / 100;

  const altLatest = (metric: string) =>
    latestMetric(currentRows.filter((row) => row.source === 'alternativeto'), metric);
  const sourceLabels: Record<string, string> = {
    github: 'GitHub',
    ga4: 'Google Analytics',
    alternativeto: 'AlternativeTo',
    sponsors: 'GitHub Sponsors',
  };

  return {
    range: { from, to, previousFrom, previousTo },
    funnel,
    timeline,
    comparison: {
      redirects: safePercent(redirects, sumMetric(previousRows, 'alternativeto_redirects')),
      repositoryViews: safePercent(
        totalRepositoryViews,
        sumMetricDimension(previousRows, 'repository_views', 'total'),
      ),
      releaseViews: safePercent(releaseViews, latestMetric(previousRows, 'release_views_14d')),
      downloads: safePercent(currentDownloads, previousDownloads),
    },
    downloads: {
      total: lifetimeDownloads,
      newInPeriod: currentDownloads,
      installers: installerDownloads,
      extensions: lifetimeDownloads - installerDownloads,
      byVersion: groupAssets((row) => row.release_tag),
      byPlatform: groupAssets((row) => extractPlatform(row.asset_name)),
      byAsset: groupAssets((row) => row.asset_name),
    },
    community: {
      stars: latestMetric(currentRows, 'stars'),
      forks: latestMetric(currentRows, 'forks'),
      issuesOpen: latestMetric(currentRows, 'issues_open'),
      issuesClosed: sumMetric(currentRows, 'issues_closed'),
      pullRequestsCreated: sumMetric(currentRows, 'pull_requests_created'),
      pullRequestsMerged: sumMetric(currentRows, 'pull_requests_merged'),
      medianIssueHours: latestMetric(currentRows, 'median_issue_hours'),
    },
    alternativeTo: {
      likes: altLatest('likes'),
      comments: altLatest('comments'),
      reviews: altLatest('reviews'),
      rating: altLatest('rating'),
    },
    sponsors: {
      active: activeSponsors.length,
      started: sponsorStarts,
      cancelled: sponsorEnds,
      mrr,
      oneTimeRevenue,
      fromAlternativeTo: new Set(
        sponsorRows
          .filter((row) => row.source === 'alternativeto')
          .map((row) => String(row.sponsor_hash)),
      ).size,
    },
    sources: syncRows.map((row) => ({
      id: String(row.source),
      label: sourceLabels[String(row.source)] ?? String(row.source),
      status: String(row.status),
      lastSuccessAt: row.last_success_at ? String(row.last_success_at) : null,
      message: String(row.message ?? ''),
    })),
    generatedAt: new Date().toISOString(),
  };
}
