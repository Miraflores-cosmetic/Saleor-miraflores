import { Suspense } from 'react';
import { CatalogClient } from './CatalogClient';
import {
  catalogPath,
  loadCatalogPage,
  siteOrigin,
  type CatalogSearch,
} from './catalogLoad';

export async function CatalogPageView({
  cat,
  sub,
  searchParams,
}: {
  cat: string;
  sub: string;
  searchParams: CatalogSearch;
}) {
  const data = await loadCatalogPage({ cat, sub, searchParams });
  const origin = siteOrigin();
  const path = catalogPath(cat, sub);
  const seoQs = new URLSearchParams();
  const collection = searchParams.collection?.trim() || '';
  const tag = searchParams.tag?.trim() || '';
  if (collection) seoQs.set('collection', collection);
  if (tag) seoQs.set('tag', tag);
  const pageUrl = `${origin}${seoQs.toString() ? `${path}?${seoQs}` : path}`;

  const itemList =
    data.notice || data.initial.items.length === 0
      ? null
      : {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          url: pageUrl,
          numberOfItems: data.initial.total,
          itemListElement: data.initial.items.map((p, i) => ({
            '@type': 'ListItem',
            position:
              (data.initial.page - 1) * data.initial.limit + i + 1,
            url: `${origin}/product/${encodeURIComponent(p.slug)}`,
            name: p.name,
          })),
        };

  return (
    <>
      {itemList ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(itemList).replace(/</g, '\\u003c'),
          }}
        />
      ) : null}
      <Suspense fallback={<main style={{ minHeight: '60vh' }} />}>
        <CatalogClient
          categories={data.categories}
          tags={data.tags}
          notice={data.notice}
          initial={data.initial}
        />
      </Suspense>
    </>
  );
}
