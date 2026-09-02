import { timingSafeEqual, randomBytes } from 'crypto';
import { UnauthorizedException } from '@nestjs/common';

export const ONEC_SESSION_COOKIE = 'onecsessid';

export function secretsEqual(expected: string, provided: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function parseBasicAuth(
  header: string | undefined,
): { login: string; password: string } | null {
  if (!header || !header.startsWith('Basic ')) return null;
  try {
    const decoded = Buffer.from(header.slice(6).trim(), 'base64').toString('utf8');
    const i = decoded.indexOf(':');
    if (i < 0) return null;
    return { login: decoded.slice(0, i), password: decoded.slice(i + 1) };
  } catch {
    return null;
  }
}

export function parseCookieValue(
  cookieHeader: string | undefined,
  name: string,
): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('=') || '');
  }
  return null;
}

export function assertOnecCredentials(opts: {
  loginConfigured: string | undefined;
  passwordConfigured: string | undefined;
  authorization: string | undefined;
}): void {
  const login = opts.loginConfigured?.trim();
  const password = opts.passwordConfigured ?? '';
  if (!login || !password) {
    throw new UnauthorizedException('1C exchange is not configured');
  }
  const basic = parseBasicAuth(opts.authorization);
  if (
    !basic ||
    !secretsEqual(login, basic.login) ||
    !secretsEqual(password, basic.password)
  ) {
    throw new UnauthorizedException('Invalid login or password');
  }
}

export function newSessionToken(): string {
  return randomBytes(24).toString('hex');
}
