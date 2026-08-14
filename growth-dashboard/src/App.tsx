import { useEffect, useMemo, useState } from 'react';
import { demoData } from './demo';
import {
  dashboardLocales,
  localeTags,
  translate,
  type DashboardLocale,
} from './i18n';
import { normalizeDashboardData } from './normalize';
import type { DashboardData, TimelinePoint } from './types';

type RangeKey = '7' | '30' | '90' | 'all';
type TimelineMetric = 'redirects' | 'repositoryViews' | 'releaseViews' | 'downloads';

const API_ORIGIN = (import.meta.env.VITE_API_ORIGIN ?? '').replace(/\/$/, '');
const SESSION_STORAGE_KEY = 'gnosi_growth_session';
const LOCALE_STORAGE_KEY = 'gnosi_growth_locale';

function captureStaticSession(): string {
  if (!API_ORIGIN) return '';
  try {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const receivedToken = fragment.get('session');
    if (receivedToken) {
      window.sessionStorage.setItem(SESSION_STORAGE_KEY, receivedToken);
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
    return window.sessionStorage.getItem(SESSION_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

let staticSessionToken = captureStaticSession();

async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (staticSessionToken) headers.set('Authorization', `Bearer ${staticSessionToken}`);
  const response = await fetch(`${API_ORIGIN}${path}`, {
    ...init,
    headers,
    credentials: API_ORIGIN ? 'omit' : 'same-origin',
  });
  if (response.status === 401 && API_ORIGIN) {
    staticSessionToken = '';
    try {
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // Session storage can be unavailable in hardened browser modes.
    }
    const returnTo = `${window.location.origin}${window.location.pathname}`;
    window.location.replace(
      `${API_ORIGIN}/auth/login?return_to=${encodeURIComponent(returnTo)}`,
    );
    return new Promise<Response>(() => undefined);
  }
  return response;
}

const ranges: RangeKey[] = ['7', '30', '90', 'all'];

function initialLocale(): DashboardLocale {
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (dashboardLocales.includes(stored as DashboardLocale)) {
      return stored as DashboardLocale;
    }
  } catch {
    // Local storage can be unavailable in hardened browser modes.
  }
  const declared = document.documentElement.lang.slice(0, 2) as DashboardLocale;
  if (dashboardLocales.includes(declared)) return declared;
  const browserLocale = navigator.language.slice(0, 2) as DashboardLocale;
  return dashboardLocales.includes(browserLocale) ? browserLocale : 'en';
}

function formatNumber(
  locale: DashboardLocale,
  value: number,
  decimals = 0,
): string {
  return new Intl.NumberFormat(localeTags[locale], {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(value);
}

function dateRange(range: RangeKey): { from: string; to: string } {
  const toDate = new Date();
  const fromDate = new Date();
  if (range === 'all') {
    return { from: '2026-07-02', to: toDate.toISOString().slice(0, 10) };
  }
  fromDate.setDate(toDate.getDate() - (Number(range) - 1));
  return {
    from: fromDate.toISOString().slice(0, 10),
    to: toDate.toISOString().slice(0, 10),
  };
}

function Icon({ name }: { name: string }) {
  const icons: Record<string, string> = {
    spark: 'M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2z',
    arrow: 'M5 12h14m-5-5 5 5-5 5',
    users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8m13 10v-2a4 4 0 0 0-3-3.87m1-11.26a4 4 0 0 1 0 7.75',
    heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.7-7.5 1.1-1.1a5.5 5.5 0 0 0 0-7.8z',
    download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4m4-5 5 5 5-5m-5 5V3',
    branch: 'M6 3v12m0 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm12-12a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM6 9c0-3 2-4 5-4h4',
    issue: 'M12 8v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  };
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={icons[name]} />
    </svg>
  );
}

function Delta({ value, locale }: { value: number; locale: DashboardLocale }) {
  const positive = value >= 0;
  return (
    <span className={`delta ${positive ? 'positive' : 'negative'}`}>
      {positive ? '↑' : '↓'} {formatNumber(locale, Math.abs(value), 1)}%
    </span>
  );
}

function Journey({
  data,
  locale,
}: {
  data: DashboardData;
  locale: DashboardLocale;
}) {
  const max = Math.max(...data.journey.map((step) => step.value ?? 0), 1);
  const stepDetail = (id: string, value: number | null): string => {
    if (id === 'repository' || id === 'releases') {
      return value === null
        ? translate(locale, 'journey.detail.unavailable')
        : translate(locale, `journey.detail.${id}`);
    }
    if (id === 'downloads') {
      return translate(locale, 'journey.detail.downloads', {
        total: formatNumber(locale, data.downloads.installerDownloads),
      });
    }
    return translate(locale, 'journey.detail.alternativeto');
  };
  return (
    <section className="panel funnel-panel" aria-labelledby="funnel-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">{translate(locale, 'journey.eyebrow')}</span>
          <h2 id="funnel-title">{translate(locale, 'journey.title')}</h2>
        </div>
        <span className="hint">{translate(locale, 'journey.hint')}</span>
      </div>
      <div className="funnel" role="list" aria-label={translate(locale, 'journey.aria')}>
        {data.journey.map((step, index) => {
          const width = step.value === null ? 52 : 52 + (step.value / max) * 48;
          return (
            <div className="funnel-row" role="listitem" key={step.id}>
              <div className="funnel-meta">
                <span className="step-number">0{index + 1}</span>
                <span>
                  {translate(locale, `journey.${step.id}`)}
                  <small className="step-detail">{stepDetail(step.id, step.value)}</small>
                </span>
                <strong>
                  {step.value === null
                    ? translate(locale, 'common.na')
                    : formatNumber(locale, step.value)}
                </strong>
              </div>
              <div className="funnel-track">
                <div
                  className={`funnel-fill step-${index + 1}`}
                  style={{ width: `${width}%` }}
                  aria-hidden="true"
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="funnel-note">
        <Icon name="spark" />
        <span>{translate(locale, 'journey.note')}</span>
      </div>
    </section>
  );
}

function TimelineChart({
  points,
  locale,
}: {
  points: TimelinePoint[];
  locale: DashboardLocale;
}) {
  const [activeMetric, setActiveMetric] = useState<TimelineMetric>('downloads');
  const [selected, setSelected] = useState<number | null>(null);
  const values = points.map((point) => point[activeMetric]);
  const max = Math.max(...values, 1);
  const width = 760;
  const height = 230;
  const padding = { x: 18, y: 24 };
  const plotWidth = width - padding.x * 2;
  const plotHeight = height - padding.y * 2;
  const path = points
    .map((point, index) => {
      const x = padding.x + (index / Math.max(points.length - 1, 1)) * plotWidth;
      const y = padding.y + plotHeight - (point[activeMetric] / max) * plotHeight;
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');
  const area = `${path} L ${padding.x + plotWidth} ${padding.y + plotHeight} L ${padding.x} ${padding.y + plotHeight} Z`;
  const metricLabels = Object.fromEntries(
    (['redirects', 'repositoryViews', 'releaseViews', 'downloads'] as TimelineMetric[]).map(
      (metric) => [metric, translate(locale, `metric.${metric}`)],
    ),
  ) as Record<TimelineMetric, string>;

  return (
    <section className="panel timeline-panel" aria-labelledby="timeline-title">
      <div className="section-heading timeline-heading">
        <div>
          <span className="eyebrow">{translate(locale, 'timeline.eyebrow')}</span>
          <h2 id="timeline-title">{translate(locale, 'timeline.title')}</h2>
        </div>
        <div className="metric-tabs" aria-label={translate(locale, 'timeline.metricAria')}>
          {(Object.keys(metricLabels) as TimelineMetric[]).map((metric) => (
            <button
              type="button"
              key={metric}
              className={activeMetric === metric ? 'active' : ''}
              onClick={() => {
                setActiveMetric(metric);
                setSelected(null);
              }}
            >
              {metricLabels[metric]}
            </button>
          ))}
        </div>
      </div>
      {points.length ? (
        <>
          <div className="chart-wrap">
            <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={translate(locale, 'timeline.perDay', { metric: metricLabels[activeMetric] })}>
              <defs>
                <linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--mint)" stopOpacity=".34" />
                  <stop offset="100%" stopColor="var(--mint)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[0, 0.5, 1].map((ratio) => (
                <line
                  key={ratio}
                  className="grid-line"
                  x1={padding.x}
                  x2={padding.x + plotWidth}
                  y1={padding.y + plotHeight * ratio}
                  y2={padding.y + plotHeight * ratio}
                />
              ))}
              <path d={area} fill="url(#area-fill)" />
              <path className="line-path" d={path} />
              {points.map((point, index) => {
                const x = padding.x + (index / Math.max(points.length - 1, 1)) * plotWidth;
                const y = padding.y + plotHeight - (point[activeMetric] / max) * plotHeight;
                return (
                  <circle
                    key={point.date}
                    className={selected === index ? 'point selected' : 'point'}
                    cx={x}
                    cy={y}
                    r={selected === index ? 5 : 3}
                    onMouseEnter={() => setSelected(index)}
                    onFocus={() => setSelected(index)}
                  >
                    <title>{`${point.date}: ${point[activeMetric]}`}</title>
                  </circle>
                );
              })}
            </svg>
          </div>
          <div className="chart-caption">
            <span>{new Intl.DateTimeFormat(localeTags[locale], { day: 'numeric', month: 'short' }).format(new Date(points[0].date))}</span>
            <strong>
              {selected === null
                ? `${formatNumber(locale, values.reduce((sum, value) => sum + value, 0))} ${translate(locale, 'common.period')}`
                : `${new Intl.DateTimeFormat(localeTags[locale], { day: 'numeric', month: 'long' }).format(new Date(points[selected].date))}: ${formatNumber(locale, points[selected][activeMetric])}`}
            </strong>
            <span>{new Intl.DateTimeFormat(localeTags[locale], { day: 'numeric', month: 'short' }).format(new Date(points.at(-1)!.date))}</span>
          </div>
        </>
      ) : (
        <EmptyState label={translate(locale, 'timeline.empty')} />
      )}
    </section>
  );
}

function BarList({
  title,
  items,
  locale,
  limit = 5,
}: {
  title: string;
  items: Array<{ label: string; value: number }>;
  locale: DashboardLocale;
  limit?: number;
}) {
  const visible = items.slice(0, limit);
  const max = Math.max(...visible.map((item) => item.value), 1);
  return (
    <div className="bar-group">
      <h3>{title}</h3>
      {visible.length ? (
        <div className="bar-list">
          {visible.map((item) => (
            <div className="bar-item" key={item.label}>
              <div className="bar-label">
                <span title={item.label}>{item.label}</span>
                <strong>{formatNumber(locale, item.value)}</strong>
              </div>
              <div className="bar-track">
                <span style={{ width: `${(item.value / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState label={translate(locale, 'bar.empty')} compact />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: string;
}) {
  return (
    <article className="stat-card">
      <div className="stat-icon">
        <Icon name={icon} />
      </div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function EmptyState({ label, compact = false }: { label: string; compact?: boolean }) {
  return <div className={compact ? 'empty compact' : 'empty'}>{label}</div>;
}

function sourceStatusLabel(
  source: DashboardData['sources'][number],
  locale: DashboardLocale,
): string {
  if (
    source.id === 'alternativeto' &&
    source.message.toLowerCase().includes('manual snapshot')
  ) {
    return translate(locale, 'source.manual');
  }
  if (source.status === 'degraded') {
    return source.id === 'alternativeto' && source.message.includes('403')
      ? translate(locale, 'source.blocked')
      : translate(locale, 'source.partial');
  }
  if (source.status === 'error') return translate(locale, 'source.error');
  if (!source.lastSuccessAt) return translate(locale, 'source.pending');
  return new Intl.DateTimeFormat(localeTags[locale], { hour: '2-digit', minute: '2-digit' }).format(
    new Date(source.lastSuccessAt),
  );
}

function SourceHealth({
  data,
  onSyncGitHub,
  syncing,
  syncMessage,
  locale,
}: {
  data: DashboardData;
  onSyncGitHub: () => void;
  syncing: boolean;
  syncMessage: string;
  locale: DashboardLocale;
}) {
  return (
    <section className="source-strip" aria-label={translate(locale, 'source.aria')}>
      <div className="source-title">
        <span className="live-dot" />
        <strong>{translate(locale, 'source.title')}</strong>
      </div>
      <div className="source-actions">
        <div className="sources">
          {data.sources.map((source) => (
            <div
              className="source"
              key={source.id}
              title={source.status === 'healthy'
                ? translate(locale, 'source.updated')
                : sourceStatusLabel(source, locale)}
            >
              <span className={`status-dot ${source.status}`} />
              <span>{source.label}</span>
              <small>{sourceStatusLabel(source, locale)}</small>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="sync-button"
          disabled={syncing}
          onClick={onSyncGitHub}
        >
          {syncing ? translate(locale, 'source.syncing') : translate(locale, 'source.sync')}
        </button>
        {syncMessage && (
          <span className="sync-message" role="status">
            {syncMessage}
          </span>
        )}
      </div>
    </section>
  );
}

interface AlternativeToDraft {
  likes: number;
  comments: number;
  reviews: number;
  rating: number;
}

function AlternativeToPanel({
  data,
  importing,
  importMessage,
  onImport,
  locale,
}: {
  data: DashboardData;
  importing: boolean;
  importMessage: string;
  onImport: (snapshot: AlternativeToDraft) => Promise<boolean>;
  locale: DashboardLocale;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<AlternativeToDraft>({
    likes: data.alternativeTo.likes,
    comments: data.alternativeTo.comments,
    reviews: data.alternativeTo.reviews,
    rating: data.alternativeTo.rating,
  });

  useEffect(() => {
    setDraft({
      likes: data.alternativeTo.likes,
      comments: data.alternativeTo.comments,
      reviews: data.alternativeTo.reviews,
      rating: data.alternativeTo.rating,
    });
  }, [
    data.alternativeTo.comments,
    data.alternativeTo.likes,
    data.alternativeTo.rating,
    data.alternativeTo.reviews,
  ]);

  const updateDraft = (key: keyof AlternativeToDraft, value: string) => {
    setDraft((current) => ({ ...current, [key]: Number(value) }));
  };

  return (
    <section className="panel alternative-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">{translate(locale, 'alternative.eyebrow')}</span>
          <h2>AlternativeTo</h2>
        </div>
        <div className="source-logo large">A</div>
      </div>
      <div className="rating">
        <strong>{formatNumber(locale, data.alternativeTo.rating, 1)}</strong>
        <div>
          <span className="stars" aria-label={translate(locale, 'alternative.rating', { rating: data.alternativeTo.rating })}>★★★★★</span>
          <small>{translate(locale, 'alternative.reviews', { count: formatNumber(locale, data.alternativeTo.reviews) })}</small>
        </div>
      </div>
      <div className="alt-metrics">
        <div><strong>{formatNumber(locale, data.alternativeTo.likes)}</strong><span>{translate(locale, 'alternative.likes')}</span></div>
        <div><strong>{formatNumber(locale, data.alternativeTo.comments)}</strong><span>{translate(locale, 'alternative.comments')}</span></div>
        <div><strong>{formatNumber(locale, data.journey[0]?.value ?? 0)}</strong><span>{translate(locale, 'alternative.outbound')}</span></div>
      </div>
      <div className="alt-import">
        <button type="button" className="sync-button" onClick={() => setEditing((value) => !value)}>
          {editing ? translate(locale, 'alternative.close') : translate(locale, 'alternative.update')}
        </button>
        {editing && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void onImport(draft).then((saved) => {
                if (saved) setEditing(false);
              });
            }}
          >
            <div className="alt-import-grid">
              <label>
                {translate(locale, 'alternative.likesField')}
                <input type="number" min="0" step="1" value={draft.likes} onChange={(event) => updateDraft('likes', event.target.value)} />
              </label>
              <label>
                {translate(locale, 'alternative.commentsField')}
                <input type="number" min="0" step="1" value={draft.comments} onChange={(event) => updateDraft('comments', event.target.value)} />
              </label>
              <label>
                {translate(locale, 'alternative.reviewsField')}
                <input type="number" min="0" step="1" value={draft.reviews} onChange={(event) => updateDraft('reviews', event.target.value)} />
              </label>
              <label>
                {translate(locale, 'alternative.ratingField')}
                <input type="number" min="0" max="5" step="0.1" value={draft.rating} onChange={(event) => updateDraft('rating', event.target.value)} />
              </label>
            </div>
            <button type="submit" className="import-submit" disabled={importing}>
              {importing ? translate(locale, 'alternative.saving') : translate(locale, 'alternative.save')}
            </button>
          </form>
        )}
        {importMessage && <span className="alt-import-message" role="status">{importMessage}</span>}
      </div>
      <a href="https://alternativeto.net/software/gnosi--your-digital-second-brain-/about/" target="_blank" rel="noreferrer">
        {translate(locale, 'alternative.view')} <Icon name="arrow" />
      </a>
    </section>
  );
}

export default function App() {
  const [locale, setLocale] = useState<DashboardLocale>(initialLocale);
  const [range, setRange] = useState<RangeKey>('30');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [demo, setDemo] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [alternativeImporting, setAlternativeImporting] = useState(false);
  const [alternativeImportMessage, setAlternativeImportMessage] = useState('');

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = translate(locale, 'document.title');
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // Local storage can be unavailable in hardened browser modes.
    }
  }, [locale]);

  useEffect(() => {
    const controller = new AbortController();
    const selectedRange = dateRange(range);
    setLoading(true);
    setError('');
    apiFetch(`/api/dashboard?from=${selectedRange.from}&to=${selectedRange.to}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(translate(locale, 'error.load', { status: response.status }));
        }
        return response.json() as Promise<unknown>;
      })
      .then((payload) => {
        setData(normalizeDashboardData(payload));
        setDemo(false);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        if (import.meta.env.DEV) {
          setData(demoData);
          setDemo(true);
        } else {
          setError(
            reason instanceof Error
              ? reason.message
              : translate(locale, 'error.loadGeneric'),
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [locale, range]);

  async function syncGitHubNow(): Promise<void> {
    const selectedRange = dateRange(range);
    setSyncing(true);
    setSyncMessage('');
    try {
      const syncResponse = await apiFetch('/api/sync?source=github', {
        method: 'POST',
        headers: { Accept: 'application/json' },
      });
      if (!syncResponse.ok) {
        throw new Error(translate(locale, 'error.sync', { status: syncResponse.status }));
      }
      const dashboardResponse = await apiFetch(
        `/api/dashboard?from=${selectedRange.from}&to=${selectedRange.to}`,
        { headers: { Accept: 'application/json' } },
      );
      if (!dashboardResponse.ok) {
        throw new Error(translate(locale, 'error.syncReload'));
      }
      setData(normalizeDashboardData(await dashboardResponse.json()));
      setDemo(false);
      setSyncMessage(translate(locale, 'status.githubUpdated'));
    } catch (reason: unknown) {
      setSyncMessage(
        reason instanceof Error ? reason.message : translate(locale, 'error.syncGeneric'),
      );
    } finally {
      setSyncing(false);
    }
  }

  async function importAlternativeToNow(snapshot: AlternativeToDraft): Promise<boolean> {
    const selectedRange = dateRange(range);
    setAlternativeImporting(true);
    setAlternativeImportMessage('');
    try {
      const importResponse = await apiFetch('/api/import/alternativeto', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
      });
      if (!importResponse.ok) {
        throw new Error(translate(locale, 'error.import', { status: importResponse.status }));
      }
      const dashboardResponse = await apiFetch(
        `/api/dashboard?from=${selectedRange.from}&to=${selectedRange.to}`,
        { headers: { Accept: 'application/json' } },
      );
      if (!dashboardResponse.ok) {
        throw new Error(translate(locale, 'error.importReload'));
      }
      setData(normalizeDashboardData(await dashboardResponse.json()));
      setDemo(false);
      setAlternativeImportMessage(translate(locale, 'status.alternativeUpdated'));
      return true;
    } catch (reason: unknown) {
      setAlternativeImportMessage(
        reason instanceof Error ? reason.message : translate(locale, 'error.importGeneric'),
      );
      return false;
    } finally {
      setAlternativeImporting(false);
    }
  }

  const totalCommunity = useMemo(
    () => (data ? data.community.issuesClosed + data.community.pullRequestsMerged : 0),
    [data],
  );

  if (loading && !data) {
    return (
      <main className="loading-screen">
        <div className="brand-mark">G</div>
        <div className="loader" />
        <span>{translate(locale, 'loading')}</span>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="error-screen">
        <div className="brand-mark">G</div>
        <h1>{translate(locale, 'error.title')}</h1>
        <p>{error}</p>
        <button type="button" onClick={() => window.location.reload()}>
          {translate(locale, 'error.retry')}
        </button>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">G</div>
          <div>
            <strong>Gnosi</strong>
            <span>{translate(locale, 'top.subtitle')}</span>
          </div>
        </div>
        <div className="top-actions">
          {demo && <span className="demo-badge">{translate(locale, 'top.sample')}</span>}
          <div className="locale-switch" aria-label={translate(locale, 'top.language')}>
            {dashboardLocales.map((item) => (
              <button
                type="button"
                className={locale === item ? 'active' : ''}
                aria-pressed={locale === item}
                key={item}
                onClick={() => setLocale(item)}
              >
                {item.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="range-switch" aria-label={translate(locale, 'top.period')}>
            {ranges.map((item) => (
              <button
                type="button"
                className={range === item ? 'active' : ''}
                aria-pressed={range === item}
                key={item}
                onClick={() => setRange(item)}
              >
                {translate(locale, `range.${item}`)}
              </button>
            ))}
          </div>
          <div className="avatar" aria-label={translate(locale, 'top.account')}>
            IG
          </div>
        </div>
      </header>

      <main>
        <section className="hero-heading">
          <div>
            <span className="eyebrow">{translate(locale, 'hero.eyebrow', { from: data.range.from, to: data.range.to })}</span>
            <h1>{translate(locale, 'hero.title')}</h1>
            <p>{translate(locale, 'hero.description')}</p>
          </div>
          <div className="hero-stat">
            <span>{translate(locale, 'hero.installers')}</span>
            <strong>{formatNumber(locale, data.downloads.installerDownloads)}</strong>
            <small>{translate(locale, 'hero.periodDelta', { count: formatNumber(locale, data.downloads.newInstallerDownloadsInPeriod) })}</small>
            <small>{translate(locale, 'hero.assetTotal', { count: formatNumber(locale, data.downloads.totalAssetDownloads) })}</small>
            <small>{translate(locale, 'hero.downloadClicks', {
              intents: formatNumber(locale, data.downloads.downloadIntentClicks),
              installers: formatNumber(locale, data.downloads.installerLinkClicks),
            })}</small>
          </div>
        </section>

        <SourceHealth
          data={data}
          onSyncGitHub={() => void syncGitHubNow()}
          syncing={syncing}
          syncMessage={syncMessage}
          locale={locale}
        />

        <div className="primary-grid">
          <Journey data={data} locale={locale} />
          <TimelineChart points={data.timeline} locale={locale} />
        </div>

        <section className="branch-intro">
          <div className="branch-line" />
          <span>{translate(locale, 'branch')}</span>
          <div className="branch-line" />
        </section>

        <div className="outcome-grid">
          <section className="panel outcome-panel community-panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">{translate(locale, 'community.eyebrow')}</span>
                <h2>{translate(locale, 'community.title')}</h2>
              </div>
              <div className="round-icon"><Icon name="users" /></div>
            </div>
            <div className="stat-grid">
              <Stat label={translate(locale, 'community.stars')} value={formatNumber(locale, data.community.stars)} detail={translate(locale, 'community.forks', { count: formatNumber(locale, data.community.forks) })} icon="spark" />
              <Stat label={translate(locale, 'community.issues')} value={formatNumber(locale, data.community.issuesClosed)} detail={translate(locale, 'community.open', { count: formatNumber(locale, data.community.issuesOpen) })} icon="issue" />
              <Stat label={translate(locale, 'community.prs')} value={formatNumber(locale, data.community.pullRequestsMerged)} detail={translate(locale, 'community.created', { count: formatNumber(locale, data.community.pullRequestsCreated) })} icon="branch" />
              <Stat label={translate(locale, 'community.response')} value={`${formatNumber(locale, data.community.medianIssueHours, 1)} h`} detail={translate(locale, 'community.median')} icon="arrow" />
            </div>
            <div className="outcome-footer">
              <span>{translate(locale, 'community.resolved', { count: formatNumber(locale, totalCommunity) })}</span>
              <span className="mini-progress"><i style={{ width: `${Math.min(100, totalCommunity * 4)}%` }} /></span>
            </div>
          </section>

          <section className="panel outcome-panel sponsor-panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">{translate(locale, 'sponsor.eyebrow')}</span>
                <h2>{translate(locale, 'sponsor.title')}</h2>
              </div>
              <div className="round-icon coral"><Icon name="heart" /></div>
            </div>
            <div className="money-row">
              <div>
                <span>{translate(locale, 'sponsor.mrr')}</span>
                <strong>${formatNumber(locale, data.sponsors.mrr, 0)}</strong>
              </div>
              <div>
                <span>{translate(locale, 'sponsor.oneTime')}</span>
                <strong>${formatNumber(locale, data.sponsors.oneTimeRevenue, 0)}</strong>
              </div>
            </div>
            <div className="sponsor-flow">
              <div><strong>{formatNumber(locale, data.sponsors.active)}</strong><span>{translate(locale, 'sponsor.active')}</span></div>
              <Icon name="arrow" />
              <div><strong>+{formatNumber(locale, data.sponsors.started)}</strong><span>{translate(locale, 'sponsor.started')}</span></div>
              <Icon name="arrow" />
              <div><strong>{formatNumber(locale, data.sponsors.cancelled)}</strong><span>{translate(locale, 'sponsor.cancelled')}</span></div>
            </div>
            <div className="attribution">
              <span className="source-logo">A</span>
              <span>{translate(locale, 'sponsor.attribution', { count: formatNumber(locale, data.sponsors.fromAlternativeTo) })}</span>
            </div>
          </section>
        </div>

        <div className="details-grid">
          <section className="panel downloads-panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">{translate(locale, 'downloads.eyebrow')}</span>
                <h2>{translate(locale, 'downloads.title')}</h2>
                <p>{translate(locale, 'downloads.summary', {
                  installers: formatNumber(locale, data.downloads.installerDownloads),
                  connectors: formatNumber(locale, data.downloads.connectorDownloads),
                  updaters: formatNumber(locale, data.downloads.updaterDownloads),
                  other: formatNumber(locale, data.downloads.otherDownloads),
                })}</p>
              </div>
              <div className="round-icon"><Icon name="download" /></div>
            </div>
            <div className="bar-columns">
              <BarList title={translate(locale, 'downloads.platform')} items={data.downloads.byInstallerPlatform} locale={locale} />
              <BarList title={translate(locale, 'downloads.version')} items={data.downloads.byVersion} locale={locale} />
              <BarList title={translate(locale, 'downloads.assets')} items={data.downloads.byAsset} locale={locale} limit={4} />
            </div>
          </section>

          <AlternativeToPanel
            data={data}
            importing={alternativeImporting}
            importMessage={alternativeImportMessage}
            onImport={importAlternativeToNow}
            locale={locale}
          />
        </div>
      </main>

      <footer>
        <span>Gnosi Growth Intelligence</span>
        <span>
          {translate(locale, 'footer.updated', {
            date: new Intl.DateTimeFormat(localeTags[locale], { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(data.generatedAt)),
          })}
        </span>
      </footer>
    </div>
  );
}
