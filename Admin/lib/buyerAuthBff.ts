import { NextResponse } from 'next/server';
import { getServerApiBase } from '@/lib/serverApiBase';
import {
  BUYER_ACCESS_TOKEN_COOKIE,
  BUYER_TOKEN_MAX_AGE_SEC,
  buyerCookieSecure,
} from './buyerAuth';

export function setBuyerCookie(
  request: Request,
  response: NextResponse,
  token: string,
): void {
  response.cookies.set({
    name: BUYER_ACCESS_TOKEN_COOKIE,
    value: token,
    httpOnly: true,
    secure: buyerCookieSecure(request),
    sameSite: 'lax',
    path: '/',
    maxAge: BUYER_TOKEN_MAX_AGE_SEC,
  });
}

/**
 * Ставит buyer cookie только если JWT принадлежит role=USER.
 * Admin token (тот же JWT secret) в jcos_buyer_token не попадёт.
 */
export async function setBuyerCookieIfUser(
  request: Request,
  response: NextResponse,
  token: string,
): Promise<boolean> {
  try {
    const res = await fetch(`${getServerApiBase()}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return false;
    const user = (await res.json()) as { id?: string; role?: string };
    if (!user?.id || user.role !== 'USER') return false;
    setBuyerCookie(request, response, token);
    return true;
  } catch {
    return false;
  }
}
