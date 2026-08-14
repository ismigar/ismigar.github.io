export interface JourneyStep {
  id: string;
  value: number | null;
}

export interface TimelinePoint {
  date: string;
  redirects: number;
  repositoryViews: number;
  releaseViews: number;
  downloads: number;
  stars: number;
  issues: number;
  pullRequests: number;
  sponsors: number;
}

export interface DashboardData {
  range: { from: string; to: string; previousFrom: string; previousTo: string };
  journey: JourneyStep[];
  timeline: TimelinePoint[];
  comparison: Record<string, number>;
  downloads: {
    totalAssetDownloads: number;
    newAssetDownloadsInPeriod: number;
    installerDownloads: number;
    newInstallerDownloadsInPeriod: number;
    connectorDownloads: number;
    updaterDownloads: number;
    otherDownloads: number;
    byVersion: Array<{ label: string; value: number }>;
    byInstallerPlatform: Array<{ label: string; value: number }>;
    byAsset: Array<{ label: string; value: number }>;
  };
  community: Record<string, number>;
  alternativeTo: Record<string, number>;
  sponsors: Record<string, number>;
  sources: Array<{
    id: string;
    label: string;
    status: string;
    lastSuccessAt: string | null;
    message: string;
  }>;
  generatedAt: string;
}
