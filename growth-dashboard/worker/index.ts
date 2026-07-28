import { buildDashboard } from './metrics';
import {
  clearAuthCookies,
  createOAuthStateCookie,
  createSessionCookie,
  isAuthorized,
  stableHash,
  verifyOAuthState,
  verifyWebhookSignature,
} from './security';
import {
  importAlternativeToSnapshot,
  normalizeAlternativeToSnapshot,
  runScheduledSync,
  syncAlternativeTo,
  syncGa4,
  syncGitHub,
  syncSponsors,
} from './sync';
import type { Env } from './types';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'private, no-store',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function authConfiguration(env: Env): {
  clientId: string;
  clientSecret: string;
  allowedLogin: string;
  sessionSecret: string;
} | null {
  const clientId = env.GITHUB_OAUTH_CLIENT_ID?.trim() ?? '';
  const clientSecret = env.GITHUB_OAUTH_CLIENT_SECRET?.trim() ?? '';
  const allowedLogin = env.GITHUB_ALLOWED_LOGIN?.trim().toLowerCase() ?? '';
  const sessionSecret = env.SESSION_SECRET?.trim() ?? '';
  if (!clientId || !clientSecret || !allowedLogin || !sessionSecret) return null;
  return { clientId, clientSecret, allowedLogin, sessionSecret };
}

function callbackUrl(request: Request): string {
  return new URL('/auth/callback', request.url).toString();
}

async function login(request: Request, env: Env): Promise<Response> {
  const config = authConfiguration(env);
  if (!config) return json({ error: 'GitHub OAuth is not configured' }, 503);
  const state = crypto.randomUUID();
  const authorize = new URL('https://github.com/login/oauth/authorize');
  authorize.searchParams.set('client_id', config.clientId);
  authorize.searchParams.set('redirect_uri', callbackUrl(request));
  authorize.searchParams.set('scope', 'read:user');
  authorize.searchParams.set('state', state);
  const headers = new Headers({ Location: authorize.toString(), 'Cache-Control': 'no-store' });
  headers.append('Set-Cookie', await createOAuthStateCookie(state, config.sessionSecret));
  return new Response(null, { status: 302, headers });
}

async function oauthCallback(request: Request, env: Env): Promise<Response> {
  const config = authConfiguration(env);
  if (!config) return json({ error: 'GitHub OAuth is not configured' }, 503);
  const url = new URL(request.url);
  const code = url.searchParams.get('code') ?? '';
  const state = url.searchParams.get('state') ?? '';
  if (!code || !state || !(await verifyOAuthState(request, state, config.sessionSecret))) {
    return json({ error: 'Invalid OAuth state' }, 400);
  }
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: callbackUrl(request),
    }),
  });
  const tokenPayload = await tokenResponse.json<{ access_token?: string; error?: string }>();
  if (!tokenResponse.ok || !tokenPayload.access_token) {
    return json({ error: tokenPayload.error ?? 'GitHub token exchange failed' }, 502);
  }
  const userResponse = await fetch('https://api.github.com/user', {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${tokenPayload.access_token}`,
      'User-Agent': 'Gnosi-Growth-Dashboard',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  const user = await userResponse.json<{ id?: number; login?: string }>();
  const loginName = user.login?.toLowerCase() ?? '';
  if (!userResponse.ok || !user.id || loginName !== config.allowedLogin) {
    return json({ error: 'This GitHub account is not allowed' }, 403);
  }
  const headers = new Headers({ Location: '/', 'Cache-Control': 'no-store' });
  headers.append('Set-Cookie', await createSessionCookie(loginName, user.id, config.sessionSecret));
  headers.append('Set-Cookie', clearAuthCookies()[1]);
  return new Response(null, { status: 302, headers });
}

function logout(): Response {
  const headers = new Headers({ Location: '/auth/login', 'Cache-Control': 'no-store' });
  clearAuthCookies().forEach((cookie) => headers.append('Set-Cookie', cookie));
  return new Response(null, { status: 302, headers });
}

function parseDate(value: string | null, fallback: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  return value;
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.max(
    1,
    Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1,
  );
}

async function handleRedirect(request: Request, env: Env, destination: string): Promise<Response> {
  const targets: Record<string, string> = {
    github: `https://github.com/${env.GITHUB_OWNER}/${env.GITHUB_REPO}`,
    releases: `https://github.com/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/releases/latest`,
    sponsors: `https://github.com/sponsors/${env.GITHUB_OWNER}?metadata_source=alternativeto&metadata_campaign=gnosi`,
  };
  const target = targets[destination];
  if (!target) return json({ error: 'Unknown redirect destination' }, 404);
  const incoming = new URL(request.url);
  const targetUrl = new URL(target);
  incoming.searchParams.forEach((value, key) => {
    if (key.startsWith('utm_') || key === 'ref') targetUrl.searchParams.set(key, value);
  });
  await env.DB.prepare(
    `INSERT INTO redirect_events(id, occurred_at, source, destination, campaign, target_url)
     VALUES (?, ?, 'alternativeto', ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      new Date().toISOString(),
      destination,
      incoming.searchParams.get('utm_campaign') ?? 'gnosi',
      targetUrl.toString(),
    )
    .run();
  return Response.redirect(targetUrl.toString(), 302);
}

async function dashboard(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const today = new Date().toISOString().slice(0, 10);
  const to = parseDate(url.searchParams.get('to'), today);
  const from = parseDate(url.searchParams.get('from'), shiftDate(to, -29));
  if (from > to) return json({ error: '`from` must not be after `to`' }, 400);
  const duration = daysBetween(from, to);
  const previousTo = shiftDate(from, -1);
  const previousFrom = shiftDate(previousTo, -(duration - 1));

  const latestSnapshotsSql = `
    SELECT source, metric, dimension, period_date, value
    FROM (
      SELECT source, metric, dimension, period_date, value,
        ROW_NUMBER() OVER (
          PARTITION BY source, metric, dimension, period_date
          ORDER BY captured_at DESC
        ) AS position
      FROM metric_snapshots
      WHERE period_date BETWEEN ? AND ?
    )
    WHERE position = 1
    ORDER BY period_date, source, metric, dimension`;

  const [current, previous, assets, redirects, sponsors, syncs] = await Promise.all([
    env.DB.prepare(latestSnapshotsSql).bind(from, to).all(),
    env.DB.prepare(latestSnapshotsSql).bind(previousFrom, previousTo).all(),
    env.DB.prepare(
      `SELECT asset_id, release_tag, asset_name, captured_at, period_date, download_count
       FROM release_asset_snapshots
       WHERE period_date <= ?
       ORDER BY asset_id, captured_at`,
    )
      .bind(to)
      .all(),
    env.DB.prepare(
      `SELECT substr(occurred_at, 1, 10) AS period_date, COUNT(*) AS value
       FROM redirect_events
       WHERE occurred_at >= ? AND occurred_at < ?
       GROUP BY substr(occurred_at, 1, 10)`,
    )
      .bind(`${from}T00:00:00.000Z`, `${shiftDate(to, 1)}T00:00:00.000Z`)
      .all(),
    env.DB.prepare(
      `SELECT action, sponsor_hash, tier_cents, one_time_cents, is_active, source, occurred_at
       FROM sponsor_events
       WHERE occurred_at < ?
       ORDER BY occurred_at`,
    )
      .bind(`${shiftDate(to, 1)}T00:00:00.000Z`)
      .all(),
    env.DB.prepare(
      `SELECT source, last_success_at, status, message FROM sync_runs ORDER BY source`,
    ).all(),
  ]);
  const redirectMap = new Map<string, number>(
    redirects.results.map((row) => [String(row.period_date), Number(row.value)]),
  );

  return json(
    buildDashboard(
      current.results as never[],
      previous.results as never[],
      assets.results as never[],
      redirectMap,
      sponsors.results as never[],
      syncs.results as never[],
      from,
      to,
      previousFrom,
      previousTo,
    ),
  );
}

interface SponsorImportRow {
  id?: string;
  occurredAt?: string;
  created_at?: string;
  action?: string;
  sponsor?: string;
  sponsorLogin?: string;
  tierCents?: number;
  monthly_amount_in_cents?: number;
  oneTimeCents?: number;
  one_time_amount_in_cents?: number;
  active?: boolean;
  is_active?: boolean;
  source?: string;
  metadata_source?: string;
}

function csvRows(text: string): SponsorImportRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((value) => value.trim());
  return lines.slice(1).map((line) => {
    const values = line.match(/(".*?"|[^",]+|(?<=,)(?=,))/g)?.map((value) =>
      value.replace(/^"|"$/g, '').replace(/""/g, '"').trim(),
    ) ?? [];
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])) as SponsorImportRow;
  });
}

async function importSponsors(request: Request, env: Env): Promise<Response> {
  const contentType = request.headers.get('Content-Type') ?? '';
  let rows: SponsorImportRow[];
  if (contentType.includes('application/json')) {
    const payload = await request.json<unknown>();
    rows = Array.isArray(payload) ? (payload as SponsorImportRow[]) : [];
  } else {
    rows = csvRows(await request.text());
  }
  if (!rows.length) return json({ error: 'No sponsor rows found' }, 400);
  let imported = 0;
  for (const row of rows) {
    const occurredAt = String(row.occurredAt ?? row.created_at ?? '');
    if (!/^\d{4}-\d{2}-\d{2}/.test(occurredAt)) continue;
    const sponsor = String(row.sponsor ?? row.sponsorLogin ?? 'private');
    const sponsorHash = await stableHash(sponsor, env.GITHUB_WEBHOOK_SECRET);
    const action = String(row.action ?? 'imported').toLowerCase();
    const tierCents = Number(row.tierCents ?? row.monthly_amount_in_cents ?? 0) || 0;
    const oneTimeCents = Number(row.oneTimeCents ?? row.one_time_amount_in_cents ?? 0) || 0;
    const activeValue = row.active ?? row.is_active;
    const active = activeValue === true || String(activeValue).toLowerCase() === 'true' ? 1 : 0;
    const source = String(row.source ?? row.metadata_source ?? 'unknown').toLowerCase();
    const id = row.id ?? `import:${sponsorHash}:${occurredAt}:${action}:${tierCents}:${oneTimeCents}`;
    const result = await env.DB.prepare(
      `INSERT OR IGNORE INTO sponsor_events
        (id, occurred_at, action, sponsor_hash, tier_cents, one_time_cents, is_active, source, raw_kind)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'import')`,
    )
      .bind(id, occurredAt, action, sponsorHash, tierCents, oneTimeCents, active, source)
      .run();
    imported += result.meta.changes;
  }
  return json({ imported, skipped: rows.length - imported });
}

async function sponsorsWebhook(request: Request, env: Env): Promise<Response> {
  const body = await request.text();
  const valid = await verifyWebhookSignature(
    body,
    request.headers.get('X-Hub-Signature-256'),
    env.GITHUB_WEBHOOK_SECRET,
  );
  if (!valid) return json({ error: 'Invalid signature' }, 401);
  const event = request.headers.get('X-GitHub-Event') ?? 'unknown';
  const delivery = request.headers.get('X-GitHub-Delivery') ?? crypto.randomUUID();
  const payload = JSON.parse(body) as {
    action?: string;
    effective_date?: string;
    sponsorship?: {
      created_at?: string;
      maintainer?: { login?: string };
      sponsor?: { login?: string };
      privacy_level?: string;
      tier?: { monthly_price_in_cents?: number };
    };
  };
  const action = payload.action ?? event;
  const sponsorship = payload.sponsorship;
  const sponsorHash = await stableHash(
    sponsorship?.sponsor?.login ?? `private:${delivery}`,
    env.GITHUB_WEBHOOK_SECRET,
  );
  const active = ['created', 'tier_changed', 'pending_cancellation'].includes(action) ? 1 : 0;
  await env.DB.prepare(
    `INSERT OR IGNORE INTO sponsor_events
      (id, occurred_at, action, sponsor_hash, tier_cents, one_time_cents, is_active, source, raw_kind)
     VALUES (?, ?, ?, ?, ?, 0, ?, 'unknown', ?)`,
  )
    .bind(
      `webhook:${delivery}`,
      payload.effective_date ?? sponsorship?.created_at ?? new Date().toISOString(),
      action,
      sponsorHash,
      sponsorship?.tier?.monthly_price_in_cents ?? 0,
      active,
      event,
    )
    .run();
  return json({ accepted: true }, 202);
}

async function manualSync(request: Request, env: Env): Promise<Response> {
  const source = new URL(request.url).searchParams.get('source') ?? 'all';
  const jobs: Record<string, () => Promise<void>> = {
    github: () => syncGitHub(env),
    alternativeto: () => syncAlternativeTo(env),
    ga4: () => syncGa4(env),
    sponsors: () => syncSponsors(env),
  };
  if (source === 'all') {
    await runScheduledSync(env, true);
  } else if (jobs[source]) {
    await jobs[source]();
  } else {
    return json({ error: 'Unknown source' }, 400);
  }
  return json({ synced: source });
}

async function importAlternativeTo(request: Request, env: Env): Promise<Response> {
  let snapshot;
  try {
    snapshot = normalizeAlternativeToSnapshot(await request.json());
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Invalid snapshot' }, 400);
  }
  await importAlternativeToSnapshot(env, snapshot);
  return json({ imported: true });
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/auth/login') return login(request, env);
  if (request.method === 'GET' && url.pathname === '/auth/callback') return oauthCallback(request, env);
  if (request.method === 'GET' && url.pathname === '/auth/logout') return logout();
  const redirectMatch = url.pathname.match(/^\/go\/alternativeto\/([a-z-]+)\/?$/);
  if (request.method === 'GET' && redirectMatch) {
    return handleRedirect(request, env, redirectMatch[1]);
  }
  if (request.method === 'POST' && url.pathname === '/api/webhooks/github/sponsors') {
    return sponsorsWebhook(request, env);
  }
  if (!(await isAuthorized(request, env))) {
    if (url.pathname.startsWith('/api/')) return json({ error: 'Unauthorized' }, 401);
    return new Response(null, {
      status: 302,
      headers: { Location: '/auth/login', 'Cache-Control': 'no-store' },
    });
  }
  if (request.method === 'GET' && url.pathname === '/api/dashboard') return dashboard(request, env);
  if (request.method === 'POST' && url.pathname === '/api/import/sponsors') {
    return importSponsors(request, env);
  }
  if (request.method === 'POST' && url.pathname === '/api/import/alternativeto') {
    return importAlternativeTo(request, env);
  }
  if (request.method === 'POST' && url.pathname === '/api/sync') return manualSync(request, env);
  return env.ASSETS.fetch(request);
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env).catch((error) =>
      json({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500),
    );
  },
  async scheduled(controller: ScheduledController, env: Env, context: ExecutionContext) {
    const daily = controller.cron === '15 2 * * *';
    context.waitUntil(runScheduledSync(env, daily));
  },
} satisfies ExportedHandler<Env>;

export { csvRows, handleRequest };
