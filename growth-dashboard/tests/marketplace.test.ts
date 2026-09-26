import { describe, expect, it } from 'vitest';
import worker from '../worker/index';
import {
  isSubmissionAuthorized,
  validateSubmissionRequest,
} from '../worker/marketplace';
import { createSessionToken } from '../worker/security';
import type { Env } from '../worker/types';

interface StoredSubmission {
  id: string;
  kind: string;
  filename: string;
  sha256: string;
  size_bytes: number;
  status: string;
  metadata_json: string;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_notes: string;
}

interface StoredChunk {
  submission_id: string;
  chunk_index: number;
  payload: ArrayBuffer;
}

function submissionRequest(
  token = 'submission-secret',
  options: { filename?: string; bytes?: Uint8Array; kind?: string; metadata?: string } = {},
): Request {
  const bytes = options.bytes ?? new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]);
  const form = new FormData();
  form.set('kind', options.kind ?? 'plugin');
  form.set('metadata', options.metadata ?? JSON.stringify({ id: 'test-plugin', version: '1.2.3' }));
  form.set(
    'package',
    new File([bytes], options.filename ?? 'test-plugin-1.2.3.gnosi-plugin.zip', {
      type: 'application/zip',
    }),
  );
  return new Request('https://growth.example.test/api/marketplace/submissions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Length': String(bytes.byteLength + 1024),
    },
    body: form,
  });
}

function marketplaceEnv(options: { failInsert?: boolean } = {}): {
  env: Env;
  chunks: StoredChunk[];
  submissions: StoredSubmission[];
} {
  const chunks: StoredChunk[] = [];
  const submissions: StoredSubmission[] = [];
  const db = {
    prepare(query: string) {
      let bound: unknown[] = [];
      const statement = {
        query,
        get bound() {
          return bound;
        },
        bind(...values: unknown[]) {
          bound = values;
          return statement;
        },
        async first() {
          if (query.includes('WHERE id = ?') && !query.includes('marketplace_submission_chunks')) {
            return submissions.find((row) => row.id === bound[0]) ?? null;
          }
          if (query.includes('SELECT id, status')) {
            return submissions.find(
              (row) => row.kind === bound[0] && row.sha256 === bound[1],
            ) ?? null;
          }
          if (query.includes('COALESCE(SUM(size_bytes)')) {
            return {
              total_bytes: submissions
                .filter((row) => row.status !== 'rejected')
                .reduce((total, row) => total + row.size_bytes, 0),
            };
          }
          if (query.includes('SELECT filename, sha256, size_bytes')) {
            return submissions.find((row) => row.id === bound[0]) ?? null;
          }
          if (query.includes('SELECT id FROM marketplace_submissions')) {
            return submissions.find((row) => row.id === bound[0]) ?? null;
          }
          return null;
        },
        async all() {
          if (query.includes('FROM marketplace_submissions') && query.includes('LIMIT 101')) {
            return { results: [...submissions]
              .filter((row) => (bound[0] === 'all' || row.status === bound[0])
                && (row.created_at < String(bound[2]) || (row.created_at === bound[2] && row.id < String(bound[4]))))
              .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)).slice(0, 101) };
          }
          if (query.includes('FROM marketplace_submission_chunks')) {
            return {
              results: chunks
                .filter((row) => row.submission_id === bound[0])
                .sort((left, right) => left.chunk_index - right.chunk_index)
                .map((row) => ({ payload: row.payload })),
            };
          }
          return { results: [] };
        },
      };
      return statement;
    },
    async batch(statements: Array<{ query: string; bound: unknown[] }>) {
      if (options.failInsert) throw new Error('database unavailable');
      for (const statement of statements) {
        if (statement.query.includes('INSERT INTO marketplace_submissions')) {
          submissions.push({
            id: String(statement.bound[0]),
            kind: String(statement.bound[1]),
            filename: String(statement.bound[2]),
            sha256: String(statement.bound[3]),
            size_bytes: Number(statement.bound[4]),
            status: 'quarantined',
            metadata_json: String(statement.bound[5]),
            created_at: String(statement.bound[6]),
            reviewed_at: null,
            reviewed_by: null,
            review_notes: '',
          });
        }
        if (statement.query.includes('INSERT INTO marketplace_submission_chunks')) {
          chunks.push({
            submission_id: String(statement.bound[0]),
            chunk_index: Number(statement.bound[1]),
            payload: statement.bound[2] as ArrayBuffer,
          });
        }
        if (statement.query.includes('UPDATE marketplace_submissions')) {
          const submission = submissions.find((row) => row.id === statement.bound[4]);
          if (submission && submission.status === 'quarantined') {
            submission.status = String(statement.bound[0]);
            submission.reviewed_at = String(statement.bound[1]);
            submission.reviewed_by = String(statement.bound[2]);
            submission.review_notes = String(statement.bound[3]);
          }
        }
        if (statement.query.includes('DELETE FROM marketplace_submission_chunks')) {
          for (let index = chunks.length - 1; index >= 0; index -= 1) {
            if (chunks[index].submission_id === statement.bound[0]
                && submissions.some((row) => row.id === statement.bound[1] && row.status === 'rejected' && row.reviewed_at === statement.bound[2])) chunks.splice(index, 1);
          }
        }
      }
      return statements.map(() => ({ meta: { changes: 1 } }));
    },
  };
  return {
    env: {
      DB: db,
      MARKETPLACE_SUBMISSION_TOKEN: 'submission-secret',
      GITHUB_ALLOWED_LOGIN: 'maintainer',
      SESSION_SECRET: 'session-secret',
    } as unknown as Env,
    chunks,
    submissions,
  };
}

async function moderationRequest(path: string, init: RequestInit = {}): Promise<Request> {
  const token = await createSessionToken('maintainer', 42, 'session-secret');
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return new Request(`https://growth.example.test${path}`, { ...init, headers });
}

describe('marketplace submission validation', () => {
  it('accepts only the dedicated bearer secret', async () => {
    const { env } = marketplaceEnv();
    await expect(isSubmissionAuthorized(submissionRequest(), env)).resolves.toBe(true);
    await expect(
      isSubmissionAuthorized(submissionRequest('wrong-secret'), env),
    ).resolves.toBe(false);
  });

  it('rejects unsafe filenames, malformed metadata, unsupported kinds, and non-ZIP bytes', async () => {
    await expect(
      validateSubmissionRequest(submissionRequest('submission-secret', { filename: '../evil.zip' })),
    ).rejects.toThrow('filename');
    await expect(
      validateSubmissionRequest(submissionRequest('submission-secret', { metadata: '{' })),
    ).rejects.toThrow('valid JSON');
    await expect(
      validateSubmissionRequest(submissionRequest('submission-secret', { kind: 'theme' })),
    ).rejects.toThrow('kind');
    await expect(
      validateSubmissionRequest(
        submissionRequest('submission-secret', { bytes: new Uint8Array([1, 2, 3, 4]) }),
      ),
    ).rejects.toThrow('ZIP file magic');
  });

  it('quarantines one object and returns the existing record for duplicates', async () => {
    const state = marketplaceEnv();
    const first = await worker.fetch(submissionRequest(), state.env);
    expect(first.status).toBe(202);
    expect(await first.json()).toMatchObject({ status: 'quarantined', review: 'pending' });
    expect(state.chunks).toHaveLength(1);
    expect(state.submissions).toHaveLength(1);

    const duplicate = await worker.fetch(submissionRequest(), state.env);
    expect(duplicate.status).toBe(202);
    expect(await duplicate.json()).toMatchObject({
      status: 'quarantined',
      duplicate: true,
      submissionId: state.submissions[0].id,
    });
    expect(state.chunks).toHaveLength(1);
  });

  it('rejects requests whose declared size exceeds the bounded Worker limit', async () => {
    const request = submissionRequest();
    request.headers.set('Content-Length', String(51 * 1024 * 1024));
    await expect(validateSubmissionRequest(request)).rejects.toThrow('too large');
  });

  it('leaves no package rows when the transactional D1 insert fails', async () => {
    const state = marketplaceEnv({ failInsert: true });
    const response = await worker.fetch(submissionRequest(), state.env);
    expect(response.status).toBe(503);
    expect(state.chunks).toHaveLength(0);
    expect(state.submissions).toHaveLength(0);
  });

  it('does not expose the ingestion endpoint without authorization', async () => {
    const state = marketplaceEnv();
    const response = await worker.fetch(submissionRequest('wrong-secret'), state.env);
    expect(response.status).toBe(401);
    expect(state.chunks).toHaveLength(0);
  });

  it('keeps moderation metadata and package downloads behind the OAuth session', async () => {
    const state = marketplaceEnv();
    const uploaded = await worker.fetch(submissionRequest(), state.env);
    const submissionId = String((await uploaded.json() as { submissionId: string }).submissionId);

    const unauthorized = await worker.fetch(
      new Request('https://growth.example.test/api/marketplace/submissions'),
      state.env,
    );
    expect(unauthorized.status).toBe(401);

    const queue = await worker.fetch(
      await moderationRequest('/api/marketplace/submissions'),
      state.env,
    );
    expect(queue.status).toBe(200);
    expect(await queue.json()).toMatchObject({
      submissions: [{ id: submissionId, status: 'quarantined' }],
    });

    const download = await worker.fetch(
      await moderationRequest(`/api/marketplace/submissions/${submissionId}/package`),
      state.env,
    );
    expect(download.status).toBe(200);
    expect(download.headers.get('X-Content-SHA256')).toBe(state.submissions[0].sha256);
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(
      new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]),
    );
  });

  it('records review decisions and erases rejected package chunks', async () => {
    const state = marketplaceEnv();
    const uploaded = await worker.fetch(submissionRequest(), state.env);
    const submissionId = String((await uploaded.json() as { submissionId: string }).submissionId);
    const body = JSON.stringify({ decision: 'rejected', notes: 'Static review failed' });
    const decision = await worker.fetch(
      await moderationRequest(`/api/marketplace/submissions/${submissionId}/decision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(new TextEncoder().encode(body).byteLength),
        },
        body,
      }),
      state.env,
    );
    expect(decision.status).toBe(200);
    expect(await decision.json()).toMatchObject({ id: submissionId, status: 'rejected' });
    expect(state.submissions[0]).toMatchObject({
      status: 'rejected',
      reviewed_by: 'maintainer',
      review_notes: 'Static review failed',
    });
    expect(state.chunks).toHaveLength(0);
  });
});

describe('moderated release handoff', () => {
  async function decide(env: Env, id: string, decision: string) {
    const body = JSON.stringify({ decision, notes: 'Reviewed content and license' });
    return worker.fetch(await moderationRequest(`/api/marketplace/submissions/${id}/decision`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': String(body.length) }, body,
    }), env);
  }

  it('exports receipts only for approved templates and prevents decision reversal', async () => {
    const state = marketplaceEnv();
    const uploaded = await worker.fetch(submissionRequest('submission-secret', {
      kind: 'vault-template', filename: 'study-1.0.0.gnosi-vault.zip',
      metadata: JSON.stringify({ id: 'study', version: '1.0.0' }),
    }), state.env);
    const { submissionId } = await uploaded.json() as { submissionId: string };
    const receiptUrl = `/api/marketplace/submissions/${submissionId}/receipt`;
    expect((await worker.fetch(await moderationRequest(receiptUrl), state.env)).status).toBe(409);
    expect((await worker.fetch(new Request(`https://growth.example.test${receiptUrl}`), state.env)).status).toBe(401);
    expect((await decide(state.env, submissionId, 'approved')).status).toBe(200);
    const receipt = await worker.fetch(await moderationRequest(receiptUrl), state.env);
    expect(await receipt.json()).toMatchObject({ schemaVersion: 1, submissionId, status: 'approved',
      sha256: state.submissions[0].sha256, reviewedBy: 'maintainer' });
    expect((await decide(state.env, submissionId, 'rejected')).status).toBe(409);
    expect(state.chunks).toHaveLength(1);
  });

  it('never resurrects a rejected package and keeps ingestion tokens out of review receipts', async () => {
    const state = marketplaceEnv();
    await worker.fetch(submissionRequest(), state.env);
    const id = state.submissions[0].id;
    expect((await decide(state.env, id, 'rejected')).status).toBe(200);
    expect((await decide(state.env, id, 'approved')).status).toBe(409);
    expect(state.chunks).toHaveLength(0);
    const response = await worker.fetch(new Request(`https://growth.example.test/api/marketplace/submissions/${id}/receipt`, {
      headers: { Authorization: 'Bearer submission-secret' },
    }), state.env);
    expect(response.status).toBe(401);
  });

  it('paginates ties without losing pending submissions and validates filters', async () => {
    const state = marketplaceEnv();
    await worker.fetch(submissionRequest(), state.env);
    const seed = state.submissions[0];
    for (let index = 0; index < 105; index += 1) state.submissions.push({ ...seed, id: crypto.randomUUID() });
    const base = '/api/marketplace/submissions?status=quarantined';
    const first = await worker.fetch(await moderationRequest(base), state.env);
    const page = await first.json() as { submissions: { id: string }[]; nextCursor: string };
    expect(page.submissions).toHaveLength(100);
    const second = await worker.fetch(await moderationRequest(`${base}&cursor=${encodeURIComponent(page.nextCursor)}`), state.env);
    const rest = await second.json() as { submissions: { id: string }[]; nextCursor: string | null };
    expect(rest.submissions).toHaveLength(6);
    expect(new Set([...page.submissions, ...rest.submissions].map((row) => row.id)).size).toBe(106);
    expect(rest.nextCursor).toBeNull();
    expect((await worker.fetch(await moderationRequest('/api/marketplace/submissions?status=wrong'), state.env)).status).toBe(400);
    expect((await worker.fetch(await moderationRequest(`${base}&cursor=bad`), state.env)).status).toBe(400);
  });
});
