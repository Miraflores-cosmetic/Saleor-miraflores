import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { BUYER_ACCESS_TOKEN_COOKIE } from '@/lib/buyerAuth';
import { getServerApiBase } from '@/lib/serverApiBase';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { orderId: string } },
) {
  const base = getServerApiBase();
  const payToken = request.nextUrl.searchParams.get('payToken')?.trim() || '';
  const qs = payToken ? `?payToken=${encodeURIComponent(payToken)}` : '';
  const buyerJwt = cookies().get(BUYER_ACCESS_TOKEN_COOKIE)?.value?.trim();

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (buyerJwt) {
    headers.Authorization = `Bearer ${buyerJwt}`;
  }

  try {
    const res = await fetch(
      `${base}/orders/${encodeURIComponent(params.orderId)}/checkout-status${qs}`,
      { cache: 'no-store', headers },
    );
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
