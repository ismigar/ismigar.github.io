import { useEffect, useRef, useState } from 'react';
import { translate, type DashboardLocale } from './i18n';

type Status = 'quarantined' | 'approved' | 'rejected';
interface Submission {
  id: string; kind: string; filename: string; sha256: string; sizeBytes: number;
  status: Status; metadata: Record<string, unknown>; createdAt: string;
  reviewedAt: string | null; reviewedBy: string | null; reviewNotes: string;
}
type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>;

export function parseQueue(value: unknown): { submissions: Submission[]; nextCursor: string | null } {
  if (!value || typeof value !== 'object' || !('submissions' in value) || !Array.isArray(value.submissions)) {
    throw new Error('Invalid moderation response');
  }
  const submissions = value.submissions.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid submission');
    const row = entry as Record<string, unknown>;
    if (typeof row.id !== 'string' || !/^[0-9a-f-]{36}$/.test(row.id)
        || !['plugin', 'vault-template'].includes(String(row.kind))
        || !['quarantined', 'approved', 'rejected'].includes(String(row.status))
        || typeof row.filename !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._+-]*\.zip$/.test(row.filename)
        || typeof row.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(row.sha256)
        || typeof row.sizeBytes !== 'number' || !Number.isSafeInteger(row.sizeBytes) || row.sizeBytes <= 0
        || typeof row.createdAt !== 'string' || !Number.isFinite(Date.parse(row.createdAt))) {
      throw new Error('Invalid submission');
    }
    return {
      ...row,
      metadata: row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : {},
      reviewedAt: typeof row.reviewedAt === 'string' ? row.reviewedAt : null,
      reviewedBy: typeof row.reviewedBy === 'string' ? row.reviewedBy : null,
      reviewNotes: typeof row.reviewNotes === 'string' ? row.reviewNotes : '',
    } as Submission;
  });
  const cursor = 'nextCursor' in value ? value.nextCursor : null;
  if (cursor !== null && typeof cursor !== 'string') throw new Error('Invalid moderation cursor');
  return { submissions, nextCursor: cursor };
}

function metadataText(row: Submission, key: string): string {
  return typeof row.metadata[key] === 'string' ? row.metadata[key] : '';
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function MarketplacePanel({ locale, apiFetch }: { locale: DashboardLocale; apiFetch: ApiFetch }) {
  const t = (key: string) => translate(locale, `marketplace.${key}`);
  const [filter, setFilter] = useState<Status | 'all'>('quarantined');
  const [rows, setRows] = useState<Submission[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState<Submission | null>(null);
  const [notes, setNotes] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [decision, setDecision] = useState<'approved' | 'rejected' | null>(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    generation.current += 1;
    setLoading(true); setError(''); setRows([]); setCursor(null); setSelected(null);
    apiFetch(`/api/marketplace/submissions?status=${filter}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return parseQueue(await response.json());
      }).then((data) => {
        if (!controller.signal.aborted) { setRows(data.submissions); setCursor(data.nextCursor); }
      }).catch(() => { if (!controller.signal.aborted) setError(translate(locale, 'marketplace.loadError')); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [apiFetch, filter, revision, locale]);

  async function loadMore() {
    if (!cursor) return;
    const current = generation.current;
    setLoading(true); setError('');
    try {
      const response = await apiFetch(`/api/marketplace/submissions?status=${filter}&cursor=${encodeURIComponent(cursor)}`);
      if (!response.ok) throw new Error();
      const data = parseQueue(await response.json());
      if (current === generation.current) {
        setRows((existing) => [...existing, ...data.submissions]); setCursor(data.nextCursor);
      }
    } catch { if (current === generation.current) setError(t('loadError')); }
    finally { if (current === generation.current) setLoading(false); }
  }

  async function download(row: Submission, receipt = false) {
    setBusy(true); setError('');
    try {
      const response = await apiFetch(`/api/marketplace/submissions/${row.id}/${receipt ? 'receipt' : 'package'}`);
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      if (!receipt) {
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())))
          .map((byte) => byte.toString(16).padStart(2, '0')).join('');
        if (digest !== row.sha256 || blob.size !== row.sizeBytes) throw new Error();
      }
      saveBlob(blob, receipt ? `${row.id}.review.json` : row.filename);
    } catch { setError(t('downloadError')); }
    finally { setBusy(false); }
  }

  async function submitDecision() {
    if (!selected || !decision || !notes.trim() || (decision === 'approved' && !reviewed)) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await apiFetch(`/api/marketplace/submissions/${selected.id}/decision`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, notes }),
      });
      if (response.status === 409) { setDecision(null); setRevision((value) => value + 1); setMessage(t('conflict')); return; }
      if (!response.ok) throw new Error();
      setMessage(t('saved')); setDecision(null); setRevision((value) => value + 1);
    } catch { setError(t('decisionError')); }
    finally { setBusy(false); }
  }

  return <section className="panel marketplace-panel" aria-labelledby="marketplace-title">
    <div className="section-heading"><div><span className="eyebrow">Marketplace</span><h1 id="marketplace-title">{t('title')}</h1><p>{t('intro')}</p></div>
      <button className="sync-button" type="button" disabled={loading || busy} onClick={() => setRevision((value) => value + 1)}>{t('refresh')}</button>
    </div>
    <div className="metric-tabs" aria-label={t('filter')}>
      {(['quarantined', 'approved', 'rejected', 'all'] as const).map((status) => <button key={status} type="button"
        disabled={busy} className={filter === status ? 'active' : ''} aria-pressed={filter === status}
        onClick={() => { setFilter(status); setMessage(''); }}>{t(status)}</button>)}
    </div>
    {error && <p role="alert" className="marketplace-error">{error}</p>}
    {message && <p role="status">{message}</p>}
    {loading && <p>{t('loading')}</p>}
    {!loading && !error && !rows.length && <p className="empty compact">{t('empty')}</p>}
    <div className="marketplace-grid">
      <ul className="marketplace-queue">{rows.map((row) => <li key={row.id}><button type="button" disabled={busy}
        aria-pressed={selected?.id === row.id} onClick={() => { setSelected(row); setNotes(''); setReviewed(false); setDecision(null); setError(''); }}>
        <strong>{metadataText(row, 'name') || metadataText(row, 'id') || row.filename}</strong>
        <span>v{metadataText(row, 'version')} · {t(row.status)}</span>
        <span>{t(row.kind)} · {(row.sizeBytes / 1024).toFixed(1)} KB</span>
      </button></li>)}</ul>
      {selected && <article className="marketplace-detail">
        <h2>{metadataText(selected, 'name') || selected.filename}</h2>
        <p>{metadataText(selected, 'description')}</p>
        <dl><dt>{t('author')}</dt><dd>{metadataText(selected, 'author') || '—'}</dd>
          <dt>{t('license')}</dt><dd>{metadataText(selected, 'license') || '—'}</dd>
          <dt>{t('received')}</dt><dd>{new Date(selected.createdAt).toLocaleString(locale)}</dd>
          <dt>SHA-256</dt><dd className="marketplace-hash">{selected.sha256}</dd></dl>
        {selected.status !== 'rejected' && <button className="sync-button" type="button" disabled={busy} onClick={() => void download(selected)}>{t('download')}</button>}
        {selected.status === 'quarantined' && <div className="marketplace-review">
          <p>{t('reviewHelp')}</p>
          <label>{t('notes')}<textarea maxLength={2000} value={notes} disabled={busy} onChange={(event) => setNotes(event.target.value)} /></label>
          <label className="marketplace-check"><input type="checkbox" checked={reviewed} disabled={busy} onChange={(event) => setReviewed(event.target.checked)} />{t('reviewed')}</label>
          {!decision ? <div className="marketplace-actions">
            <button className="import-submit" type="button" disabled={busy || !reviewed || !notes.trim()} onClick={() => setDecision('approved')}>{t('approve')}</button>
            <button className="sync-button" type="button" disabled={busy || !notes.trim()} onClick={() => setDecision('rejected')}>{t('reject')}</button>
          </div> : <div className="marketplace-confirm" role="group" aria-label={t('confirmTitle')}>
            <p>{t(decision === 'approved' ? 'approveHelp' : 'rejectHelp')}</p>
            <button className="import-submit" type="button" disabled={busy || !notes.trim() || (decision === 'approved' && !reviewed)} onClick={() => void submitDecision()}>{t('confirm')}</button>
            <button className="sync-button" type="button" disabled={busy} onClick={() => setDecision(null)}>{t('cancel')}</button>
          </div>}
        </div>}
        {selected.status !== 'quarantined' && <div className="marketplace-reviewed"><p>{selected.reviewedBy} · {selected.reviewedAt ? new Date(selected.reviewedAt).toLocaleString(locale) : ''}</p><p>{selected.reviewNotes}</p></div>}
        {selected.status === 'approved' && selected.kind === 'vault-template' && <div className="marketplace-publication">
          <h3>{t('publication')}</h3><p>{t('publicationHelp')}</p>
          <button className="import-submit" type="button" disabled={busy} onClick={() => void download(selected, true)}>{t('receipt')}</button>
          <a href="https://github.com/ismigar/Gnosi/blob/main/extensions/marketplace/MODERATION.md" target="_blank" rel="noreferrer">{t('guide')}</a>
        </div>}
      </article>}
    </div>
    {cursor && <button className="sync-button" disabled={loading || busy} type="button" onClick={() => void loadMore()}>{t('more')}</button>}
  </section>;
}
