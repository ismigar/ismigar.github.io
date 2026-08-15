import { ALTERNATIVETO_PARSER_VERSION, parseAlternativeTo } from './alternativeto';
import type { Env } from './types';

const GITHUB_API_VERSION = '2026-03-10';
const ALTERNATIVETO_MANUAL_VERSION = 'manual-v2';
const ALTERNATIVETO_READER_VERSION = 'jina-reader-v1';

export interface ManualAlternativeToSnapshot {
  likes: number;
  comments: number;
  reviews: number;
  rating: number;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function now(): string {
  return new Date().toISOString();
}

async function recordSync(
  env: Env,
  source: string,
  status: 'healthy' | 'degraded' | 'error',
  message = '',
  parserVersion?: string,
) {
  const timestamp = now();
  await env.DB.prepare(
    `INSERT INTO sync_runs(source, last_attempt_at, last_success_at, status, message, parser_version)
     VALUES (?, ?, CASE WHEN ? = 'healthy' THEN ? ELSE NULL END, ?, ?, ?)
     ON CONFLICT(source) DO UPDATE SET
       last_attempt_at = excluded.last_attempt_at,
       last_success_at = CASE WHEN excluded.status = 'healthy' THEN excluded.last_attempt_at ELSE sync_runs.last_success_at END,
       status = excluded.status,
       message = excluded.message,
       parser_version = COALESCE(excluded.parser_version, sync_runs.parser_version)`,
  )
    .bind(source, timestamp, status, timestamp, status, message, parserVersion ?? null)
    .run();
}

async function insertMetric(
  env: Env,
  source: string,
  metric: string,
  value: number,
  periodDate = today(),
  dimension = '',
  capturedAt = now(),
) {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO metric_snapshots
      (source, metric, dimension, captured_at, period_date, value)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(source, metric, dimension, capturedAt, periodDate, value)
    .run();
}

export function normalizeAlternativeToSnapshot(input: unknown): ManualAlternativeToSnapshot {
  if (!input || typeof input !== 'object') {
    throw new Error('AlternativeTo snapshot must be an object');
  }
  const record = input as Record<string, unknown>;
  const limits: Record<keyof ManualAlternativeToSnapshot, number> = {
    likes: 1_000_000,
    comments: 1_000_000,
    reviews: 1_000_000,
    rating: 5,
  };
  const result = {} as ManualAlternativeToSnapshot;
  for (const key of Object.keys(limits) as Array<keyof ManualAlternativeToSnapshot>) {
    const value = Number(record[key]);
    if (!Number.isFinite(value) || value < 0 || value > limits[key]) {
      throw new Error(`Invalid AlternativeTo ${key}`);
    }
    if (key !== 'rating' && !Number.isInteger(value)) {
      throw new Error(`Invalid AlternativeTo ${key}`);
    }
    result[key] = value;
  }
  return result;
}

export async function importAlternativeToSnapshot(
  env: Env,
  snapshot: ManualAlternativeToSnapshot,
): Promise<void> {
  const periodDate = today();
  const capturedAt = `${periodDate}T23:59:59.999Z`;
  await Promise.all(
    (Object.keys(snapshot) as Array<keyof ManualAlternativeToSnapshot>).map((metric) =>
      env.DB.prepare(
        `INSERT INTO metric_snapshots
          (source, metric, dimension, captured_at, period_date, value)
         VALUES ('alternativeto', ?, 'manual', ?, ?, ?)
         ON CONFLICT(source, metric, dimension, captured_at, period_date)
         DO UPDATE SET value = excluded.value`,
      )
        .bind(metric, capturedAt, periodDate, snapshot[metric])
        .run(),
    ),
  );
  await recordSync(
    env,
    'alternativeto',
    'healthy',
    'Manual snapshot imported from the public listing; no official metrics API is available',
    ALTERNATIVETO_MANUAL_VERSION,
  );
}

async function githubFetch<T>(env: Env, path: string): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'gnosi-growth-dashboard',
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
  };
  if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  const response = await fetch(`https://api.github.com${path}`, {
    headers,
  });
  if (!response.ok) {
    throw new Error(`GitHub ${response.status}: ${await response.text()}`);
  }
  return response.json<T>();
}

interface GitHubRepo {
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
}

interface GitHubTraffic {
  views?: Array<{ timestamp: string; count: number; uniques: number }>;
}

interface GitHubPath {
  path: string;
  count: number;
  uniques: number;
}

interface GitHubReferrer {
  referrer: string;
  count: number;
  uniques: number;
}

interface GitHubRelease {
  tag_name: string;
  assets: Array<{ id: number; name: string; download_count: number }>;
}

interface GitHubIssue {
  created_at: string;
  closed_at: string | null;
  pull_request?: unknown;
}

interface GitHubPull {
  created_at: string;
  merged_at: string | null;
}

export async function syncGitHub(env: Env): Promise<void> {
  const capturedAt = now();
  try {
    const ownerRepo = `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}`;
    const [repo, releases, issues, pulls] = await Promise.all([
      githubFetch<GitHubRepo>(env, ownerRepo),
      githubFetch<GitHubRelease[]>(env, `${ownerRepo}/releases?per_page=100`),
      githubFetch<GitHubIssue[]>(env, `${ownerRepo}/issues?state=all&per_page=100&sort=updated&direction=desc`),
      githubFetch<GitHubPull[]>(env, `${ownerRepo}/pulls?state=all&per_page=100&sort=updated&direction=desc`),
    ]);
    let traffic: GitHubTraffic = {};
    let paths: GitHubPath[] = [];
    let referrers: GitHubReferrer[] = [];
    let trafficAvailable = false;
    if (env.GITHUB_TOKEN) {
      try {
        [traffic, paths, referrers] = await Promise.all([
          githubFetch<GitHubTraffic>(env, `${ownerRepo}/traffic/views?per=day`),
          githubFetch<GitHubPath[]>(env, `${ownerRepo}/traffic/popular/paths`),
          githubFetch<GitHubReferrer[]>(env, `${ownerRepo}/traffic/popular/referrers`),
        ]);
        trafficAvailable = true;
      } catch {
        // Public repository metrics remain useful when the traffic permission is unavailable.
      }
    }

    const issueOnly = issues.filter((issue) => !issue.pull_request);
    const closedDurations = issueOnly
      .filter((issue) => issue.closed_at)
      .map((issue) => (Date.parse(issue.closed_at!) - Date.parse(issue.created_at)) / 3_600_000)
      .sort((a, b) => a - b);
    const medianIssueHours = closedDurations.length
      ? closedDurations[Math.floor(closedDurations.length / 2)]
      : 0;

    const currentDate = today();
    await Promise.all([
      insertMetric(env, 'github', 'stars', repo.stargazers_count, currentDate, '', capturedAt),
      insertMetric(env, 'github', 'forks', repo.forks_count, currentDate, '', capturedAt),
      insertMetric(
        env,
        'github',
        'issues_open',
        issueOnly.filter((issue) => !issue.closed_at).length,
        currentDate,
        '',
        capturedAt,
      ),
      insertMetric(env, 'github', 'median_issue_hours', medianIssueHours, currentDate, '', capturedAt),
    ]);

    for (const day of traffic.views ?? []) {
      await Promise.all([
        insertMetric(
          env,
          'github',
          'repository_views',
          day.count,
          day.timestamp.slice(0, 10),
          'total',
          capturedAt,
        ),
        insertMetric(
          env,
          'github',
          'repository_unique_visitors',
          day.uniques,
          day.timestamp.slice(0, 10),
          'unique',
          capturedAt,
        ),
      ]);
    }
    const releaseViews = paths
      .filter((item) => item.path.includes('/releases'))
      .reduce((sum, item) => sum + item.count, 0);
    const releaseUniqueVisitors = paths
      .filter((item) => item.path.includes('/releases'))
      .reduce((sum, item) => sum + item.uniques, 0);
    const alternativeToReferrers = referrers.filter((item) =>
      item.referrer.toLowerCase().includes('alternativeto'),
    );
    const alternativeToGitHubViews = alternativeToReferrers.reduce(
      (sum, item) => sum + item.count,
      0,
    );
    const alternativeToGitHubUniqueVisitors = alternativeToReferrers.reduce(
      (sum, item) => sum + item.uniques,
      0,
    );
    await Promise.all([
      insertMetric(
        env,
        'github',
        'release_views_14d',
        releaseViews,
        currentDate,
        'total',
        capturedAt,
      ),
      insertMetric(
        env,
        'github',
        'release_unique_visitors_14d',
        releaseUniqueVisitors,
        currentDate,
        'unique',
        capturedAt,
      ),
      insertMetric(
        env,
        'github',
        'alternativeto_github_views_14d',
        alternativeToGitHubViews,
        currentDate,
        'total',
        capturedAt,
      ),
      insertMetric(
        env,
        'github',
        'alternativeto_github_unique_visitors_14d',
        alternativeToGitHubUniqueVisitors,
        currentDate,
        'unique',
        capturedAt,
      ),
    ]);

    const startDate = env.DASHBOARD_START_DATE;
    const createdByDay = new Map<string, number>();
    const closedByDay = new Map<string, number>();
    issueOnly.forEach((issue) => {
      const created = issue.created_at.slice(0, 10);
      if (created >= startDate) createdByDay.set(created, (createdByDay.get(created) ?? 0) + 1);
      const closed = issue.closed_at?.slice(0, 10);
      if (closed && closed >= startDate) closedByDay.set(closed, (closedByDay.get(closed) ?? 0) + 1);
    });
    for (const [date, value] of createdByDay) {
      await insertMetric(env, 'github', 'issues_created', value, date, '', capturedAt);
    }
    for (const [date, value] of closedByDay) {
      await insertMetric(env, 'github', 'issues_closed', value, date, '', capturedAt);
    }

    const prsCreated = new Map<string, number>();
    const prsMerged = new Map<string, number>();
    pulls.forEach((pull) => {
      const created = pull.created_at.slice(0, 10);
      if (created >= startDate) prsCreated.set(created, (prsCreated.get(created) ?? 0) + 1);
      const merged = pull.merged_at?.slice(0, 10);
      if (merged && merged >= startDate) prsMerged.set(merged, (prsMerged.get(merged) ?? 0) + 1);
    });
    for (const [date, value] of prsCreated) {
      await insertMetric(env, 'github', 'pull_requests_created', value, date, '', capturedAt);
    }
    for (const [date, value] of prsMerged) {
      await insertMetric(env, 'github', 'pull_requests_merged', value, date, '', capturedAt);
    }

    for (const release of releases) {
      for (const asset of release.assets) {
        await env.DB.prepare(
          `INSERT OR IGNORE INTO release_asset_snapshots
            (asset_id, release_tag, asset_name, captured_at, period_date, download_count)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
          .bind(asset.id, release.tag_name, asset.name, capturedAt, currentDate, asset.download_count)
          .run();
      }
    }
    await recordSync(
      env,
      'github',
      trafficAvailable ? 'healthy' : 'degraded',
      trafficAvailable ? '' : 'Public metrics synced; GITHUB_TOKEN is required for traffic',
    );
  } catch (error) {
    await recordSync(env, 'github', 'error', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export async function syncAlternativeTo(env: Env): Promise<void> {
  try {
    if (!env.JINA_API_KEY) throw new Error('JINA_API_KEY is not configured');
    let response: Response | undefined;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      response = await fetch(`https://r.jina.ai/${env.ALTERNATIVETO_URL}`, {
        headers: {
          Accept: 'text/plain',
          Authorization: `Bearer ${env.JINA_API_KEY}`,
          'X-Cache-Tolerance': '3600',
          'X-Target-Selector': '[title="Like Gnosi"], .commonBoxList',
        },
      });
      if (response.status !== 429 || attempt === 2) break;
      const retryAfter = Number(response.headers.get('Retry-After'));
      const delayMs =
        Math.min(10, Math.max(1, Number.isFinite(retryAfter) ? retryAfter : 2)) * 1000;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    if (!response) throw new Error('Jina Reader did not return a response');
    if (!response.ok) throw new Error(`Jina Reader returned ${response.status}`);
    const metrics = parseAlternativeTo(await response.text());
    const capturedAt = now();
    await Promise.all(
      (['likes', 'comments', 'reviews', 'rating'] as const).map((metric) =>
        insertMetric(env, 'alternativeto', metric, metrics[metric], today(), '', capturedAt),
      ),
    );
    await recordSync(
      env,
      'alternativeto',
      'healthy',
      'Public listing snapshot via Jina Reader',
      `${ALTERNATIVETO_READER_VERSION}:${metrics.parserVersion}`,
    );
  } catch (error) {
    const manualSnapshot = await env.DB.prepare(
      `SELECT 1 AS available
       FROM metric_snapshots
       WHERE source = 'alternativeto' AND dimension = 'manual'
       LIMIT 1`,
    ).first();
    const errorMessage = error instanceof Error ? error.message : String(error);
    await recordSync(
      env,
      'alternativeto',
      'degraded',
      manualSnapshot
        ? `${errorMessage}; latest manual snapshot retained`
        : errorMessage,
      ALTERNATIVETO_PARSER_VERSION,
    );
    throw error;
  }
}

function base64Url(value: Uint8Array | string): string {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = '';
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function ga4AccessToken(env: Env): Promise<string> {
  if (!env.GA4_CLIENT_EMAIL || !env.GA4_PRIVATE_KEY) {
    throw new Error('GA4 service account credentials are not configured');
  }
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64Url(
    JSON.stringify({
      iss: env.GA4_CLIENT_EMAIL,
      scope: 'https://www.googleapis.com/auth/analytics.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      iat: issuedAt,
      exp: issuedAt + 3600,
    }),
  );
  const pem = env.GA4_PRIVATE_KEY.replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const binary = Uint8Array.from(atob(pem), (character) => character.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    'pkcs8',
    binary,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const unsigned = `${header}.${claim}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)),
  );
  const assertion = `${unsigned}.${base64Url(signature)}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!response.ok) throw new Error(`GA4 OAuth returned ${response.status}`);
  const payload = await response.json<{ access_token: string }>();
  return payload.access_token;
}

export async function syncGa4(env: Env): Promise<void> {
  try {
    if (!env.GA4_PROPERTY_ID || env.GA4_PROPERTY_ID.startsWith('REPLACE_')) {
      throw new Error('GA4_PROPERTY_ID is not configured');
    }
    const token = await ga4AccessToken(env);
    const response = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${env.GA4_PROPERTY_ID}:runReport`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateRanges: [{ startDate: env.DASHBOARD_START_DATE, endDate: 'today' }],
          dimensions: [{ name: 'date' }, { name: 'eventName' }],
          metrics: [{ name: 'eventCount' }],
          dimensionFilter: {
            filter: {
              fieldName: 'eventName',
              inListFilter: {
                values: [
                  'github_click',
                  'github_repo_click',
                  'github_release_click',
                  'github_sponsor_click',
                  'desktop_download_click',
                  'installer_download_click',
                ],
              },
            },
          },
          limit: 10_000,
        }),
      },
    );
    if (!response.ok) throw new Error(`GA4 Data API returned ${response.status}`);
    const report = await response.json<{
      rows?: Array<{
        dimensionValues: Array<{ value: string }>;
        metricValues: Array<{ value: string }>;
      }>;
    }>();
    const metricMap: Record<string, string> = {
      github_click: 'github_clicks',
      github_repo_click: 'repository_clicks',
      github_release_click: 'release_views',
      github_sponsor_click: 'sponsor_clicks',
      desktop_download_click: 'download_intents',
      installer_download_click: 'installer_link_clicks',
    };
    const capturedAt = now();
    for (const row of report.rows ?? []) {
      const rawDate = row.dimensionValues[0].value;
      const date = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
      const eventName = row.dimensionValues[1].value;
      await insertMetric(
        env,
        'ga4',
        metricMap[eventName] ?? eventName,
        Number(row.metricValues[0].value),
        date,
        '',
        capturedAt,
      );
    }
    await recordSync(env, 'ga4', 'healthy');
  } catch (error) {
    await recordSync(env, 'ga4', 'error', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

interface SponsorshipNode {
  createdAt: string;
  isActive: boolean;
  privacyLevel: string;
  sponsorEntity: { login: string } | null;
  tier: { monthlyPriceInCents: number } | null;
}

export async function syncSponsors(env: Env): Promise<void> {
  try {
    if (!env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN is not configured');
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'gnosi-growth-dashboard',
      },
      body: JSON.stringify({
        query: `query($login: String!) {
          user(login: $login) {
            sponsorshipsAsMaintainer(first: 100, includePrivate: true) {
              nodes {
                createdAt
                isActive
                privacyLevel
                sponsorEntity { ... on User { login } ... on Organization { login } }
                tier { monthlyPriceInCents }
              }
            }
          }
        }`,
        variables: { login: env.GITHUB_OWNER },
      }),
    });
    if (!response.ok) throw new Error(`GitHub Sponsors GraphQL returned ${response.status}`);
    const payload = await response.json<{
      data?: { user?: { sponsorshipsAsMaintainer?: { nodes?: SponsorshipNode[] } } };
      errors?: Array<{ message: string }>;
    }>();
    if (payload.errors?.length) throw new Error(payload.errors.map((error) => error.message).join('; '));
    for (const node of payload.data?.user?.sponsorshipsAsMaintainer?.nodes ?? []) {
      const login = node.sponsorEntity?.login ?? `private-${node.createdAt}`;
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(login));
      const sponsorHash = Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
      await env.DB.prepare(
        `INSERT INTO sponsor_events
          (id, occurred_at, action, sponsor_hash, tier_cents, one_time_cents, is_active, source, raw_kind)
         VALUES (?, ?, 'snapshot', ?, ?, 0, ?, 'unknown', 'graphql')
         ON CONFLICT(id) DO UPDATE SET tier_cents = excluded.tier_cents, is_active = excluded.is_active`,
      )
        .bind(
          `graphql:${sponsorHash}`,
          node.createdAt,
          sponsorHash,
          node.tier?.monthlyPriceInCents ?? 0,
          node.isActive ? 1 : 0,
        )
        .run();
    }
    await recordSync(env, 'sponsors', 'healthy');
  } catch (error) {
    await recordSync(env, 'sponsors', 'error', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export async function runScheduledSync(env: Env, daily: boolean): Promise<void> {
  const jobs: Array<Promise<void>> = [syncGitHub(env)];
  if (daily) {
    jobs.push(syncGa4(env), syncSponsors(env));
    if (env.JINA_API_KEY) jobs.push(syncAlternativeTo(env));
  }
  await Promise.allSettled(jobs);
}
