import type { DashboardData } from './types';

const today = new Date();
const points = Array.from({ length: 30 }, (_, index) => {
  const date = new Date(today);
  date.setDate(today.getDate() - (29 - index));
  const pulse = index % 7 === 2 ? 7 : 0;
  return {
    date: date.toISOString().slice(0, 10),
    redirects: Math.max(0, Math.round(8 + index * 0.45 + Math.sin(index) * 4 + pulse)),
    repositoryViews: Math.max(0, Math.round(15 + index * 0.7 + Math.cos(index / 2) * 6 + pulse)),
    releaseViews: Math.max(0, Math.round(9 + index * 0.42 + Math.sin(index / 3) * 4)),
    downloads: Math.max(0, Math.round(4 + index * 0.28 + Math.cos(index / 2.5) * 3)),
    stars: 18 + Math.floor(index / 3),
    issues: index % 5 === 0 ? 2 : index % 3 === 0 ? 1 : 0,
    pullRequests: index % 9 === 0 ? 1 : 0,
    sponsors: index === 12 || index === 26 ? 1 : 0,
  };
});

export const demoData: DashboardData = {
  range: {
    from: points[0].date,
    to: points.at(-1)!.date,
    previousFrom: points[0].date,
    previousTo: points[0].date,
  },
  funnel: [
    { id: 'alternativeto', label: 'Clics des d’AlternativeTo', value: 356, conversion: null },
    { id: 'repository', label: 'Visites a GitHub', value: 274, conversion: 77 },
    { id: 'releases', label: 'Visites a releases', value: 168, conversion: 61.3 },
    { id: 'downloads', label: 'Descàrregues confirmades', value: 93, conversion: 55.4 },
  ],
  timeline: points,
  comparison: { redirects: 24.6, repositoryViews: 18.2, releaseViews: 11.4, downloads: 31.0 },
  downloads: {
    total: 93,
    byVersion: [
      { label: 'v0.3.0', value: 58 },
      { label: 'v0.2.1', value: 24 },
      { label: 'v0.2.0', value: 11 },
    ],
    byPlatform: [
      { label: 'macOS', value: 39 },
      { label: 'Windows', value: 27 },
      { label: 'Linux', value: 14 },
      { label: 'Web Clipper', value: 8 },
      { label: 'LibreOffice', value: 5 },
    ],
    byAsset: [
      { label: 'Gnosi-0.3.0-arm64.dmg', value: 31 },
      { label: 'Gnosi-Setup-0.3.0.exe', value: 27 },
      { label: 'Gnosi-0.3.0.AppImage', value: 14 },
      { label: 'gnosi-web-clipper.zip', value: 8 },
    ],
  },
  community: {
    stars: 27,
    forks: 6,
    issuesOpen: 8,
    issuesClosed: 14,
    pullRequestsCreated: 5,
    pullRequestsMerged: 4,
    medianIssueHours: 31.5,
  },
  alternativeTo: { likes: 21, comments: 4, reviews: 3, rating: 4.7 },
  sponsors: {
    active: 4,
    started: 2,
    cancelled: 0,
    mrr: 38,
    oneTimeRevenue: 75,
    fromAlternativeTo: 1,
  },
  sources: [
    { id: 'github', label: 'GitHub', status: 'healthy', lastSuccessAt: new Date().toISOString(), message: '' },
    { id: 'ga4', label: 'Google Analytics', status: 'healthy', lastSuccessAt: new Date().toISOString(), message: '' },
    { id: 'alternativeto', label: 'AlternativeTo', status: 'healthy', lastSuccessAt: new Date().toISOString(), message: '' },
    { id: 'sponsors', label: 'GitHub Sponsors', status: 'degraded', lastSuccessAt: new Date(Date.now() - 3_600_000).toISOString(), message: 'Actualització pendent' },
  ],
  generatedAt: new Date().toISOString(),
};
