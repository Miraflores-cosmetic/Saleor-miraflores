import { NextRequest, NextResponse } from 'next/server';
import { getServerApiBase } from '@/lib/serverApiBase';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const base = getServerApiBase();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ items: [], removedKeys: [] }, { status: 400 });
  }
  try {
    const res = await fetch(`${base}/catalog/cart/sync`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: {
        'content-type': res.headers.get('content-type') ?? 'application/json; charset=utf-8',
      },
    });
  } catch {
    return NextResponse.json({ items: [], removedKeys: [] }, { status: 502 });
  }
}
