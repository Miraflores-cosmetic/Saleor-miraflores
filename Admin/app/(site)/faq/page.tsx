import type { Metadata } from 'next';
import { Faq } from '@/sections/home/Faq/Faq';
import { FaqJsonLd } from '@/components/FaqJsonLd/FaqJsonLd';
import { fetchPublicFaq } from '@/lib/faqPublicServer';

export const metadata: Metadata = {
  title: 'FAQ — Jcos',
};

export default async function FaqPage({
  searchParams,
}: {
  searchParams?: { q?: string };
}) {
  const faq = await fetchPublicFaq();
  const items = faq.items;
  const openId =
    typeof searchParams?.q === 'string' && searchParams.q.trim()
      ? searchParams.q.trim()
      : null;

  return (
    <main>
      <FaqJsonLd items={items} />
      <Faq title="FAQ" items={items} initialOpenId={openId} />
      {!faq.ok ? (
        <div className="padding-global" style={{ maxWidth: 720, margin: '64px auto', textAlign: 'center' }}>
          <p style={{ margin: 0, fontFamily: 'var(--font-open-sans)', lineHeight: 1.5 }}>
            Не удалось загрузить FAQ. Попробуйте обновить страницу позже.
          </p>
        </div>
      ) : !items.length ? (
        <div className="padding-global" style={{ maxWidth: 720, margin: '64px auto', textAlign: 'center' }}>
          <p style={{ margin: 0, fontFamily: 'var(--font-open-sans)', lineHeight: 1.5 }}>
            Вопросы пока не добавлены.
          </p>
        </div>
      ) : null}
    </main>
  );
}
