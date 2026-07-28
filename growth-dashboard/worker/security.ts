import type { Env } from './types';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const SESSION_COOKIE = 'gnosi_growth_session';
const OAUTH_STATE_COOKIE = 'gnosi_growth_oauth_state';

interface SessionPayload {
  login: string;
  id: number;
  exp: number;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  bytes.set(Array.from(binary, (character) => character.charCodeAt(0)));
  return bytes;
}

async function hmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))));
}

async function verifyHmac(value: string, signature: string, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  try {
    return crypto.subtle.verify('HMAC', key, base64UrlToBytes(signature), encoder.encode(value));
  } catch {
    return false;
  }
}

function cookieValue(request: Request, name: string): string | null {
  const cookies = request.headers.get('Cookie') ?? '';
  for (const item of cookies.split(';')) {
    const [key, ...parts] = item.trim().split('=');
    if (key === name) return parts.join('=');
  }
  return null;
}

function secureCookie(name: string, value: string, maxAge: number): string {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export async function createSessionCookie(
  login: string,
  id: number,
  secret: string,
  now = Date.now(),
): Promise<string> {
  return secureCookie(
    SESSION_COOKIE,
    await createSessionToken(login, id, secret, now),
    8 * 60 * 60,
  );
}

export async function createSessionToken(
  login: string,
  id: number,
  secret: string,
  now = Date.now(),
): Promise<string> {
  const payload: SessionPayload = {
    login: login.toLowerCase(),
    id,
    exp: Math.floor(now / 1000) + 8 * 60 * 60,
  };
  const encoded = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  return `${encoded}.${await hmac(encoded, secret)}`;
}

async function readSessionToken(
  token: string | null,
  secret: string | undefined,
  now = Date.now(),
): Promise<SessionPayload | null> {
  if (!secret || !token) return null;
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature || !(await verifyHmac(encoded, signature, secret))) return null;
  try {
    const payload = JSON.parse(decoder.decode(base64UrlToBytes(encoded))) as SessionPayload;
    if (!payload.login || !Number.isInteger(payload.id) || payload.exp <= Math.floor(now / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function readSession(
  request: Request,
  secret: string | undefined,
  now = Date.now(),
): Promise<SessionPayload | null> {
  const authorization = request.headers.get('Authorization') ?? '';
  const bearerToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : null;
  return readSessionToken(bearerToken ?? cookieValue(request, SESSION_COOKIE), secret, now);
}

export async function createOAuthStateCookie(state: string, secret: string): Promise<string> {
  return secureCookie(OAUTH_STATE_COOKIE, `${state}.${await hmac(state, secret)}`, 10 * 60);
}

export async function verifyOAuthState(
  request: Request,
  state: string,
  secret: string | undefined,
): Promise<boolean> {
  if (!secret) return false;
  const stored = cookieValue(request, OAUTH_STATE_COOKIE);
  const [value, signature] = stored?.split('.') ?? [];
  return Boolean(value && signature && value === state && await verifyHmac(value, signature, secret));
}

export function clearAuthCookies(): string[] {
  return [
    secureCookie(SESSION_COOKIE, '', 0),
    secureCookie(OAUTH_STATE_COOKIE, '', 0),
  ];
}

export async function isAuthorized(request: Request, env: Env): Promise<boolean> {
  const allowed = env.GITHUB_ALLOWED_LOGIN?.trim().toLowerCase() ?? '';
  if (!allowed) return false;
  const session = await readSession(request, env.SESSION_SECRET);
  return session?.login === allowed;
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
