import { useEffect, useMemo, useState } from 'react';
import { demoData } from './demo';
import type { DashboardData, TimelinePoint } from './types';

type RangeKey = '7' | '30' | '90' | 'all';
type TimelineMetric = 'redirects' | 'repositoryViews' | 'releaseViews' | 'downloads';

const ranges: Array<{ id: RangeKey; label: string }> = [
  { id: '7', label: '7 dies' },
  { id: '30', label: '30 dies' },
  { id: '90', label: '90 dies' },
  { id: 'all', label: 'Tot' },
];

const metricLabels: Record<TimelineMetric, string> = {
  redirects: 'Clics AlternativeTo',
  repositoryViews: 'Visites GitHub',
  releaseViews: 'Visites releases',
  downloads: 'Descàrregues',
};

function formatNumber(value: number, decimals = 0): string {
  return new Intl.NumberFormat('ca-ES', {
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

function Delta({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <span className={`delta ${positive ? 'positive' : 'negative'}`}>
      {positive ? '↑' : '↓'} {formatNumber(Math.abs(value), 1)}%
    </span>
  );
}

function Funnel({ data }: { data: DashboardData }) {
  const max = Math.max(...data.funnel.map((step) => step.value ?? 0), 1);
  return (
    <section className="panel funnel-panel" aria-labelledby="funnel-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Adquisició</span>
          <h2 id="funnel-title">Del descobriment a la descàrrega</h2>
        </div>
        <span className="hint">Intenció → confirmació</span>
      </div>
      <div className="funnel" role="list" aria-label="Embut de conversió">
        {data.funnel.map((step, index) => {
          const width = step.value === null ? 52 : 52 + (step.value / max) * 48;
          return (
            <div className="funnel-row" role="listitem" key={step.id}>
              <div className="funnel-meta">
                <span className="step-number">0{index + 1}</span>
                <span>
                  {step.label}
                  {step.detail && <small className="step-detail">{step.detail}</small>}
                </span>
                <strong>{step.value === null ? 'N/D' : formatNumber(step.value)}</strong>
              </div>
              <div className="funnel-track">
                <div
                  className={`funnel-fill step-${index + 1}`}
                  style={{ width: `${width}%` }}
                  aria-hidden="true"
                />
              </div>
              {step.conversion !== null && (
                <div className="conversion">
                  <span>{formatNumber(step.conversion, 1)}%</span>
                  <small>conversió</small>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="funnel-note">
        <Icon name="spark" />
        <span>
          Les 49 descàrregues prèvies formen la línia base. L’embut només atribueix com a noves els increments observats després de començar el seguiment.
        </span>
      </div>
    </section>
  );
}

function TimelineChart({ points }: { points: TimelinePoint[] }) {
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

  return (
    <section className="panel timeline-panel" aria-labelledby="timeline-title">
      <div className="section-heading timeline-heading">
        <div>
          <span className="eyebrow">Tendència</span>
          <h2 id="timeline-title">Evolució diària</h2>
        </div>
        <div className="metric-tabs" aria-label="Mètrica del gràfic">
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
            <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${metricLabels[activeMetric]} per dia`}>
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
            <span>{new Intl.DateTimeFormat('ca-ES', { day: 'numeric', month: 'short' }).format(new Date(points[0].date))}</span>
            <strong>
              {selected === null
                ? `${formatNumber(values.reduce((sum, value) => sum + value, 0))} en el període`
                : `${new Intl.DateTimeFormat('ca-ES', { day: 'numeric', month: 'long' }).format(new Date(points[selected].date))}: ${formatNumber(points[selected][activeMetric])}`}
            </strong>
            <span>{new Intl.DateTimeFormat('ca-ES', { day: 'numeric', month: 'short' }).format(new Date(points.at(-1)!.date))}</span>
          </div>
        </>
      ) : (
        <EmptyState label="Encara no hi ha dades per aquest període." />
      )}
    </section>
  );
}

function BarList({
  title,
  items,
  limit = 5,
}: {
  title: string;
  items: Array<{ label: string; value: number }>;
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
                <strong>{formatNumber(item.value)}</strong>
              </div>
              <div className="bar-track">
                <span style={{ width: `${(item.value / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState label="Sense descàrregues noves." compact />
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

function SourceHealth({ data }: { data: DashboardData }) {
  return (
    <section className="source-strip" aria-label="Qualitat de les fonts">
      <div className="source-title">
        <span className="live-dot" />
        <strong>Qualitat de dades</strong>
      </div>
      <div className="sources">
        {data.sources.map((source) => (
          <div className="source" key={source.id} title={source.message || 'Font actualitzada'}>
            <span className={`status-dot ${source.status}`} />
            <span>{source.label}</span>
            <small>
              {source.lastSuccessAt
                ? new Intl.DateTimeFormat('ca-ES', { hour: '2-digit', minute: '2-digit' }).format(
                    new Date(source.lastSuccessAt),
                  )
                : 'pendent'}
            </small>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function App() {
  const [range, setRange] = useState<RangeKey>('30');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const selectedRange = dateRange(range);
    setLoading(true);
    setError('');
    fetch(`/api/dashboard?from=${selectedRange.from}&to=${selectedRange.to}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`No s’han pogut carregar les dades (${response.status}).`);
        return response.json() as Promise<DashboardData>;
      })
      .then((payload) => {
        setData(payload);
        setDemo(false);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        if (import.meta.env.DEV) {
          setData(demoData);
          setDemo(true);
        } else {
          setError(reason instanceof Error ? reason.message : 'No s’han pogut carregar les dades.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [range]);

  const totalCommunity = useMemo(
    () => (data ? data.community.issuesClosed + data.community.pullRequestsMerged : 0),
    [data],
  );

  if (loading && !data) {
    return (
      <main className="loading-screen">
        <div className="brand-mark">G</div>
        <div className="loader" />
        <span>Preparant les mètriques…</span>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="error-screen">
        <div className="brand-mark">G</div>
        <h1>No podem obrir el dashboard</h1>
        <p>{error}</p>
        <button type="button" onClick={() => window.location.reload()}>
          Torna-ho a provar
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
            <span>Growth intelligence</span>
          </div>
        </div>
        <div className="top-actions">
          {demo && <span className="demo-badge">Dades de mostra</span>}
          <div className="range-switch" aria-label="Període">
            {ranges.map((item) => (
              <button
                type="button"
                className={range === item.id ? 'active' : ''}
                aria-pressed={range === item.id}
                key={item.id}
                onClick={() => setRange(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="avatar" aria-label="Compte d’Ismael">
            IG
          </div>
        </div>
      </header>

      <main>
        <section className="hero-heading">
          <div>
            <span className="eyebrow">Creixement · {data.range.from} — {data.range.to}</span>
            <h1>De la descoberta a la comunitat</h1>
            <p>Una lectura honesta de com Gnosi atrau, converteix i crea relacions.</p>
          </div>
          <div className="hero-stat">
            <span>Descàrregues acumulades</span>
            <strong>{formatNumber(data.downloads.total)}</strong>
            <small>+{formatNumber(data.downloads.newInPeriod)} durant el període</small>
          </div>
        </section>

        <SourceHealth data={data} />

        <div className="primary-grid">
          <Funnel data={data} />
          <TimelineChart points={data.timeline} />
        </div>

        <section className="branch-intro">
          <div className="branch-line" />
          <span>Què passa després de la descàrrega?</span>
          <div className="branch-line" />
        </section>

        <div className="outcome-grid">
          <section className="panel outcome-panel community-panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Comunitat</span>
                <h2>Participació i confiança</h2>
              </div>
              <div className="round-icon"><Icon name="users" /></div>
            </div>
            <div className="stat-grid">
              <Stat label="Estrelles" value={formatNumber(data.community.stars)} detail={`${formatNumber(data.community.forks)} forks`} icon="spark" />
              <Stat label="Issues resoltes" value={formatNumber(data.community.issuesClosed)} detail={`${formatNumber(data.community.issuesOpen)} obertes`} icon="issue" />
              <Stat label="PR integrades" value={formatNumber(data.community.pullRequestsMerged)} detail={`${formatNumber(data.community.pullRequestsCreated)} creades`} icon="branch" />
              <Stat label="Temps de resposta" value={`${formatNumber(data.community.medianIssueHours, 1)} h`} detail="mediana de resolució" icon="arrow" />
            </div>
            <div className="outcome-footer">
              <span>{formatNumber(totalCommunity)} contribucions resoltes</span>
              <span className="mini-progress"><i style={{ width: `${Math.min(100, totalCommunity * 4)}%` }} /></span>
            </div>
          </section>

          <section className="panel outcome-panel sponsor-panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Sostenibilitat</span>
                <h2>Patrocinis</h2>
              </div>
              <div className="round-icon coral"><Icon name="heart" /></div>
            </div>
            <div className="money-row">
              <div>
                <span>MRR actual</span>
                <strong>${formatNumber(data.sponsors.mrr, 0)}</strong>
              </div>
              <div>
                <span>Ingressos puntuals</span>
                <strong>${formatNumber(data.sponsors.oneTimeRevenue, 0)}</strong>
              </div>
            </div>
            <div className="sponsor-flow">
              <div><strong>{formatNumber(data.sponsors.active)}</strong><span>actius</span></div>
              <Icon name="arrow" />
              <div><strong>+{formatNumber(data.sponsors.started)}</strong><span>altes</span></div>
              <Icon name="arrow" />
              <div><strong>{formatNumber(data.sponsors.cancelled)}</strong><span>baixes</span></div>
            </div>
            <div className="attribution">
              <span className="source-logo">A</span>
              <span><strong>{formatNumber(data.sponsors.fromAlternativeTo)}</strong> patrocinis atribuïts a AlternativeTo</span>
            </div>
          </section>
        </div>

        <div className="details-grid">
          <section className="panel downloads-panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Distribució</span>
                <h2>Què es descarrega?</h2>
                <p>{formatNumber(data.downloads.installers)} instal·ladors · {formatNumber(data.downloads.extensions)} extensions i artefactes</p>
              </div>
              <div className="round-icon"><Icon name="download" /></div>
            </div>
            <div className="bar-columns">
              <BarList title="Per plataforma" items={data.downloads.byPlatform} />
              <BarList title="Per versió" items={data.downloads.byVersion} />
              <BarList title="Artefactes principals" items={data.downloads.byAsset} limit={4} />
            </div>
          </section>

          <section className="panel alternative-panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Descobriment</span>
                <h2>AlternativeTo</h2>
              </div>
              <div className="source-logo large">A</div>
            </div>
            <div className="rating">
              <strong>{formatNumber(data.alternativeTo.rating, 1)}</strong>
              <div>
                <span className="stars" aria-label={`${data.alternativeTo.rating} de 5`}>★★★★★</span>
                <small>{formatNumber(data.alternativeTo.reviews)} valoracions</small>
              </div>
            </div>
            <div className="alt-metrics">
              <div><strong>{formatNumber(data.alternativeTo.likes)}</strong><span>m’agrada</span></div>
              <div><strong>{formatNumber(data.alternativeTo.comments)}</strong><span>comentaris</span></div>
              <div><strong>{formatNumber(data.funnel[0]?.value ?? 0)}</strong><span>clics sortints</span></div>
            </div>
            <a href="https://alternativeto.net/software/gnosi--your-digital-second-brain-/about/" target="_blank" rel="noreferrer">
              Veure la fitxa <Icon name="arrow" />
            </a>
          </section>
        </div>
      </main>

      <footer>
        <span>Gnosi Growth Intelligence</span>
        <span>
          Actualitzat {new Intl.DateTimeFormat('ca-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(data.generatedAt))}
        </span>
      </footer>
    </div>
  );
}
