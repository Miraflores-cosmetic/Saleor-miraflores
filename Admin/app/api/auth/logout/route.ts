import { NextResponse } from 'next/server';
import { BUYER_ACCESS_TOKEN_COOKIE, buyerCookieSecure } from '@/lib/buyerAuth';

export async function POST(request: Request) {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: BUYER_ACCESS_TOKEN_COOKIE,
    value: '',
    httpOnly: true,
    secure: buyerCookieSecure(request),
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}
