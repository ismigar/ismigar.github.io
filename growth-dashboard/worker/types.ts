export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_TOKEN?: string;
  GITHUB_WEBHOOK_SECRET?: string;
  ALTERNATIVETO_URL: string;
  DASHBOARD_START_DATE: string;
  GITHUB_OAUTH_CLIENT_ID?: string;
  GITHUB_OAUTH_CLIENT_SECRET?: string;
  GITHUB_ALLOWED_LOGIN?: string;
  SESSION_SECRET?: string;
  DASHBOARD_PUBLIC_URL?: string;
  GA4_PROPERTY_ID?: string;
  GA4_CLIENT_EMAIL?: string;
  GA4_PRIVATE_KEY?: string;
  MARKETPLACE_SUBMISSION_TOKEN?: string;
}

export type MarketplaceSubmissionKind = 'plugin' | 'vault-template';

export interface MarketplaceSubmissionRow {
  id: string;
  kind: MarketplaceSubmissionKind;
  filename: string;
  sha256: string;
  size_bytes: number;
  status: 'quarantined' | 'approved' | 'rejected';
  metadata_json: string;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_notes: string;
}

export interface AlternativeToMetrics {
  likes: number;
  comments: number;
  reviews: number;
  rating: number;
  parserVersion: string;
}

export interface MetricPoint {
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

export interface DashboardResponse {
  range: { from: string; to: string; previousFrom: string; previousTo: string };
  funnel: Array<{
    id: string;
    label: string;
    value: number | null;
    conversion: number | null;
    detail?: string;
  }>;
  timeline: MetricPoint[];
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
