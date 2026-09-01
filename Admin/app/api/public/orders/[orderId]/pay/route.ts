import { NextRequest, NextResponse } from 'next/server';
import { getServerApiBase } from '@/lib/serverApiBase';

export const dynamic = 'force-dynamic';

async function proxy(path: string, init?: RequestInit) {
  const base = getServerApiBase();
  try {
    const res = await fetch(`${base}/${path.replace(/^\//, '')}`, {
      ...init,
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: {
        'content-type':
          res.headers.get('content-type') ?? 'application/json; charset=utf-8',
      },
    });
  } catch {
    return NextResponse.json({ message: 'Сервис недоступен' }, { status: 502 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { orderId: string } },
) {
  const body = await request.text();
  return proxy(`orders/${encodeURIComponent(params.orderId)}/pay`, {
    method: 'POST',
    body: body || '{}',
  });
}
