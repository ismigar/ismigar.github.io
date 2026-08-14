import type {
  Env,
  MarketplaceSubmissionKind,
  MarketplaceSubmissionRow,
} from './types';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'private, no-store',
};
const MAX_METADATA_BYTES = 64 * 1024;
const MAX_MULTIPART_OVERHEAD = 256 * 1024;
const PACKAGE_CHUNK_BYTES = 1_500_000;
const MAX_QUARANTINE_BYTES = 250 * 1024 * 1024;
const MAX_PACKAGE_BYTES: Record<MarketplaceSubmissionKind, number> = {
  plugin: 20 * 1024 * 1024,
  'vault-template': 50 * 1024 * 1024,
};
const MAX_REQUEST_BYTES = MAX_PACKAGE_BYTES['vault-template'] + MAX_MULTIPART_OVERHEAD;
const SAFE_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}\.zip$/;
const SAFE_ID = /^[a-z0-9][a-z0-9_-]{1,63}$/;
const SEMVER = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const SUBMISSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class MarketplaceRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

interface ValidatedSubmission {
  kind: MarketplaceSubmissionKind;
  filename: string;
  metadata: Record<string, unknown>;
  packageBytes: ArrayBuffer;
  sha256: string;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function bearerToken(request: Request): string {
  const authorization = request.headers.get('Authorization') ?? '';
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
}

async function sha256Bytes(value: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
  );
}

export async function isSubmissionAuthorized(request: Request, env: Env): Promise<boolean> {
  const expected = env.MARKETPLACE_SUBMISSION_TOKEN?.trim() ?? '';
  const actual = bearerToken(request);
  if (!expected || !actual) return false;
  const [expectedHash, actualHash] = await Promise.all([
    sha256Bytes(expected),
    sha256Bytes(actual),
  ]);
  let difference = 0;
  for (let index = 0; index < expectedHash.length; index += 1) {
    difference |= expectedHash[index] ^ actualHash[index];
  }
  return difference === 0;
}

function parseKind(value: FormDataEntryValue | null): MarketplaceSubmissionKind {
  if (value === 'plugin' || value === 'vault-template') return value;
  throw new MarketplaceRequestError(400, 'Unsupported marketplace submission kind');
}

function parseMetadata(value: FormDataEntryValue | null): Record<string, unknown> {
  if (typeof value !== 'string' || !value || new TextEncoder().encode(value).length > MAX_METADATA_BYTES) {
    throw new MarketplaceRequestError(400, 'Submission metadata is missing or too large');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new MarketplaceRequestError(400, 'Submission metadata must be valid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new MarketplaceRequestError(400, 'Submission metadata must be an object');
  }
  const metadata = parsed as Record<string, unknown>;
  if (typeof metadata.id !== 'string' || !SAFE_ID.test(metadata.id)) {
    throw new MarketplaceRequestError(400, 'Submission metadata has an invalid id');
  }
  if (typeof metadata.version !== 'string' || !SEMVER.test(metadata.version)) {
    throw new MarketplaceRequestError(400, 'Submission metadata has an invalid version');
  }
  return metadata;
}

function hasZipMagic(bytes: Uint8Array): boolean {
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return false;
  return (
    (bytes[2] === 0x03 && bytes[3] === 0x04)
    || (bytes[2] === 0x05 && bytes[3] === 0x06)
    || (bytes[2] === 0x07 && bytes[3] === 0x08)
  );
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function validateSubmissionRequest(request: Request): Promise<ValidatedSubmission> {
  const contentLength = Number(request.headers.get('Content-Length'));
  if (!Number.isSafeInteger(contentLength) || contentLength <= 0) {
    throw new MarketplaceRequestError(411, 'A valid Content-Length header is required');
  }
  if (contentLength > MAX_REQUEST_BYTES) {
    throw new MarketplaceRequestError(413, 'Marketplace submission request is too large');
  }
  if (!(request.headers.get('Content-Type') ?? '').toLowerCase().startsWith('multipart/form-data;')) {
    throw new MarketplaceRequestError(415, 'Marketplace submissions must use multipart form data');
  }

  const form = await request.formData();
  const fields: string[] = [];
  form.forEach((_value, field) => fields.push(field));
  if (
    fields.length !== 3
    || !['kind', 'metadata', 'package'].every(
      (field) => fields.filter((candidate) => candidate === field).length === 1,
    )
  ) {
    throw new MarketplaceRequestError(400, 'Submission multipart fields are invalid');
  }
  const kind = parseKind(form.get('kind'));
  const metadata = parseMetadata(form.get('metadata'));
  const packageFile = form.get('package');
  if (!(packageFile instanceof File)) {
    throw new MarketplaceRequestError(400, 'A ZIP package is required');
  }
  if (!SAFE_FILENAME.test(packageFile.name)) {
    throw new MarketplaceRequestError(400, 'Package filename is not allowed');
  }
  const suffix = kind === 'plugin' ? 'gnosi-plugin.zip' : 'gnosi-vault.zip';
  const expectedFilename = `${metadata.id}-${metadata.version}.${suffix}`;
  if (packageFile.name !== expectedFilename) {
    throw new MarketplaceRequestError(400, 'Package filename does not match its metadata');
  }
  if (packageFile.type !== 'application/zip') {
    throw new MarketplaceRequestError(415, 'Package media type must be application/zip');
  }
  if (packageFile.size <= 0 || packageFile.size > MAX_PACKAGE_BYTES[kind]) {
    throw new MarketplaceRequestError(413, `${kind} package is too large`);
  }
  const packageBytes = await packageFile.arrayBuffer();
  if (!hasZipMagic(new Uint8Array(packageBytes, 0, Math.min(packageBytes.byteLength, 4)))) {
    throw new MarketplaceRequestError(400, 'Package does not have ZIP file magic');
  }
  const sha256 = toHex(await crypto.subtle.digest('SHA-256', packageBytes));
  return { kind, filename: packageFile.name, metadata, packageBytes, sha256 };
}

export async function submitMarketplacePackage(request: Request, env: Env): Promise<Response> {
  if (!(await isSubmissionAuthorized(request, env))) {
    return json({ error: 'Unauthorized' }, 401);
  }
  let submission: ValidatedSubmission;
  try {
    submission = await validateSubmissionRequest(request);
  } catch (error) {
    if (error instanceof MarketplaceRequestError) return json({ error: error.message }, error.status);
    return json({ error: 'Invalid marketplace submission' }, 400);
  }

  let existing: { id: string; status: string } | null;
  try {
    existing = await env.DB.prepare(
      `SELECT id, status FROM marketplace_submissions WHERE kind = ? AND sha256 = ?`,
    ).bind(submission.kind, submission.sha256).first<{ id: string; status: string }>();
  } catch {
    return json({ error: 'Marketplace quarantine is temporarily unavailable' }, 503);
  }
  if (existing) {
    return json({ status: existing.status, submissionId: existing.id, duplicate: true }, 202);
  }

  let storedBytes = 0;
  try {
    const capacity = await env.DB.prepare(
      `SELECT COALESCE(SUM(size_bytes), 0) AS total_bytes
       FROM marketplace_submissions
       WHERE status != 'rejected'`,
    ).first<{ total_bytes: number }>();
    storedBytes = Number(capacity?.total_bytes ?? 0);
  } catch {
    return json({ error: 'Marketplace quarantine is temporarily unavailable' }, 503);
  }
  if (storedBytes + submission.packageBytes.byteLength > MAX_QUARANTINE_BYTES) {
    return json({ error: 'Marketplace quarantine capacity is exhausted' }, 507);
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  try {
    const statements: D1PreparedStatement[] = [env.DB.prepare(
      `INSERT INTO marketplace_submissions
        (id, kind, filename, sha256, size_bytes, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      submission.kind,
      submission.filename,
      submission.sha256,
      submission.packageBytes.byteLength,
      JSON.stringify(submission.metadata),
      createdAt,
    )];
    let chunkIndex = 0;
    for (let offset = 0; offset < submission.packageBytes.byteLength; offset += PACKAGE_CHUNK_BYTES) {
      statements.push(env.DB.prepare(
        `INSERT INTO marketplace_submission_chunks(submission_id, chunk_index, payload)
         VALUES (?, ?, ?)`,
      ).bind(
        id,
        chunkIndex,
        submission.packageBytes.slice(offset, offset + PACKAGE_CHUNK_BYTES),
      ));
      chunkIndex += 1;
    }
    await env.DB.batch(statements);
  } catch {
    return json({ error: 'Marketplace quarantine is temporarily unavailable' }, 503);
  }
  return json({
    status: 'quarantined',
    submissionId: id,
    sha256: submission.sha256,
    review: 'pending',
  }, 202);
}

function publicSubmission(row: MarketplaceSubmissionRow): Record<string, unknown> {
  let metadata: unknown = {};
  try {
    metadata = JSON.parse(row.metadata_json);
  } catch {
    metadata = {};
  }
  return {
    id: row.id,
    kind: row.kind,
    filename: row.filename,
    sha256: row.sha256,
    sizeBytes: row.size_bytes,
    status: row.status,
    metadata,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
    reviewNotes: row.review_notes,
  };
}

export async function listMarketplaceSubmissions(env: Env): Promise<Response> {
  try {
    const rows = await env.DB.prepare(
      `SELECT id, kind, filename, sha256, size_bytes, status, metadata_json,
              created_at, reviewed_at, reviewed_by, review_notes
       FROM marketplace_submissions
       ORDER BY created_at DESC
       LIMIT 100`,
    ).all<MarketplaceSubmissionRow>();
    return json({ submissions: rows.results.map(publicSubmission) });
  } catch {
    return json({ error: 'Marketplace quarantine is temporarily unavailable' }, 503);
  }
}

function storedChunk(value: unknown): Uint8Array {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (Array.isArray(value) && value.every((item) => Number.isInteger(item) && item >= 0 && item <= 255)) {
    return Uint8Array.from(value as number[]);
  }
  throw new Error('Invalid stored marketplace chunk');
}

export async function downloadMarketplaceSubmission(
  env: Env,
  submissionId: string,
): Promise<Response> {
  if (!SUBMISSION_ID.test(submissionId)) return json({ error: 'Invalid submission id' }, 400);
  let submission: { filename: string; sha256: string; size_bytes: number } | null;
  let chunks: D1Result<{ payload: unknown }>;
  try {
    submission = await env.DB.prepare(
      `SELECT filename, sha256, size_bytes FROM marketplace_submissions WHERE id = ?`,
    ).bind(submissionId).first<{ filename: string; sha256: string; size_bytes: number }>();
    chunks = await env.DB.prepare(
      `SELECT payload FROM marketplace_submission_chunks
       WHERE submission_id = ? ORDER BY chunk_index`,
    ).bind(submissionId).all<{ payload: unknown }>();
  } catch {
    return json({ error: 'Marketplace quarantine is temporarily unavailable' }, 503);
  }
  if (!submission) return json({ error: 'Submission not found' }, 404);
  if (
    !Number.isSafeInteger(submission.size_bytes)
    || submission.size_bytes <= 0
    || submission.size_bytes > MAX_PACKAGE_BYTES['vault-template']
  ) {
    return json({ error: 'Quarantined package metadata is invalid' }, 500);
  }
  const packageBytes = new Uint8Array(submission.size_bytes);
  let offset = 0;
  try {
    for (const row of chunks.results) {
      const chunk = storedChunk(row.payload);
      if (offset + chunk.byteLength > packageBytes.byteLength) {
        return json({ error: 'Quarantined package is oversized' }, 500);
      }
      packageBytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
  } catch {
    return json({ error: 'Quarantined package is unreadable' }, 500);
  }
  if (offset !== submission.size_bytes) {
    return json({ error: 'Quarantined package is incomplete' }, 500);
  }
  const sha256 = toHex(await crypto.subtle.digest('SHA-256', packageBytes));
  if (sha256 !== submission.sha256) {
    return json({ error: 'Quarantined package integrity check failed' }, 500);
  }
  return new Response(packageBytes, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${submission.filename}"`,
      'Content-Length': String(packageBytes.byteLength),
      'X-Content-SHA256': sha256,
      'Cache-Control': 'private, no-store',
    },
  });
}

export async function decideMarketplaceSubmission(
  request: Request,
  env: Env,
  submissionId: string,
  reviewer: string,
): Promise<Response> {
  if (!SUBMISSION_ID.test(submissionId)) return json({ error: 'Invalid submission id' }, 400);
  const declaredLength = Number(request.headers.get('Content-Length'));
  if (!Number.isSafeInteger(declaredLength) || declaredLength <= 0) {
    return json({ error: 'A valid Content-Length header is required' }, 411);
  }
  if (declaredLength > 8 * 1024) return json({ error: 'Decision payload is too large' }, 413);
  if (!(request.headers.get('Content-Type') ?? '').toLowerCase().startsWith('application/json')) {
    return json({ error: 'Decision body must use application/json' }, 415);
  }
  let body: { decision?: unknown; notes?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Decision body must be valid JSON' }, 400);
  }
  if (body.decision !== 'approved' && body.decision !== 'rejected') {
    return json({ error: 'Decision must be approved or rejected' }, 400);
  }
  const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
  if (notes.length > 2000) return json({ error: 'Review notes are too long' }, 400);
  const reviewedAt = new Date().toISOString();
  const update = env.DB.prepare(
    `UPDATE marketplace_submissions
     SET status = ?, reviewed_at = ?, reviewed_by = ?, review_notes = ?
     WHERE id = ?`,
  ).bind(body.decision, reviewedAt, reviewer, notes, submissionId);
  let existing: { id: string } | null;
  try {
    existing = await env.DB.prepare(
      `SELECT id FROM marketplace_submissions WHERE id = ?`,
    ).bind(submissionId).first<{ id: string }>();
  } catch {
    return json({ error: 'Marketplace quarantine is temporarily unavailable' }, 503);
  }
  if (!existing) return json({ error: 'Submission not found' }, 404);
  const statements = [update];
  if (body.decision === 'rejected') {
    statements.push(env.DB.prepare(
      `DELETE FROM marketplace_submission_chunks WHERE submission_id = ?`,
    ).bind(submissionId));
  }
  try {
    await env.DB.batch(statements);
  } catch {
    return json({ error: 'Marketplace quarantine is temporarily unavailable' }, 503);
  }
  return json({ id: submissionId, status: body.decision, reviewedAt });
}
