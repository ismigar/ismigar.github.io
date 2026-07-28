export interface FunnelStep {
  id: string;
  label: string;
  value: number | null;
  conversion: number | null;
  detail?: string;
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
  funnel: FunnelStep[];
  timeline: TimelinePoint[];
  comparison: Record<string, number>;
  downloads: {
    total: number;
    newInPeriod: number;
    installers: number;
    extensions: number;
    byVersion: Array<{ label: string; value: number }>;
    byPlatform: Array<{ label: string; value: number }>;
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
