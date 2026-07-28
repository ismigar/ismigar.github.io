import type { Env } from './types';

const encoder = new TextEncoder();

export function isAuthorized(request: Request, env: Env): boolean {
  const allowed = env.ALLOWED_EMAIL?.trim().toLowerCase() ?? '';
  if (!allowed || allowed.startsWith('replace_')) return false;
  const email = request.headers.get('Cf-Access-Authenticated-User-Email')?.trim().toLowerCase();
  return email === allowed;
}

export async function verifyWebhookSignature(
  body: string,
  signature: string | null,
  secret: string | undefined,
): Promise<boolean> {
  if (!secret || !signature?.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const expected = signature.slice('sha256='.length);
  const bytes = new Uint8Array(expected.match(/.{1,2}/g)?.map((part) => Number.parseInt(part, 16)) ?? []);
  return crypto.subtle.verify('HMAC', key, bytes, encoder.encode(body));
}

export async function stableHash(value: string, secret = 'gnosi-growth'): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`${secret}:${value}`));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
