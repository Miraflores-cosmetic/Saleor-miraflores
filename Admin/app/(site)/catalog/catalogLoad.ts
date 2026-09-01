import type { Metadata } from 'next';
import {
  fetchPublicCatalogTags,
  fetchPublicCategories,
  fetchPublicCollection,
  fetchPublicProductsPage,
  PUBLIC_CATALOG_PAGE_SIZE,
} from '@/lib/publicCatalog';
import type { CatalogNotice } from './CatalogClient';

export type CatalogSearch = {
  tag?: string;
  collection?: string;
  sale?: string;
  priceMin?: string;
  priceMax?: string;
  page?: string;
  /** legacy — только для редиректа со старых URL */
  cat?: string;
  sub?: string;
};

export function siteOrigin(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    '';
  return fromEnv.replace(/\/+$/, '') || 'http://localhost:3000';
}

export function catalogPath(cat: string, sub = ''): string {
  if (!cat) return '/catalog';
  const base = `/catalog/${encodeURIComponent(cat)}`;
  return sub ? `${base}/${encodeURIComponent(sub)}` : base;
}

function resolveNotice(opts: {
  cat: string;
  sub: string;
  tag: string;
  collection: string;
  categories: Awaited<ReturnType<typeof fetchPublicCategories>>;
  tags: Awaited<ReturnType<typeof fetchPublicCatalogTags>>;
  collectionOk: boolean;
  productsOk: boolean;
}): CatalogNotice | null {
  if (!opts.productsOk) return 'api';
  if (opts.collection && !opts.collectionOk) return 'unknown_collection';
  if (opts.tag && !opts.tags.some((t) => t.slug === opts.tag)) return 'unknown_tag';
  if (opts.cat) {
    const root = opts.categories.find((c) => c.slug === opts.cat);
    if (!root) return 'unknown_cat';
    if (opts.sub && !root.children?.some((c) => c.slug === opts.sub)) {
      return 'unknown_sub';
    }
  } else if (opts.sub) {
    return 'unknown_sub';
  }
  return null;
}

export async function buildCatalogMetadata(opts: {
  cat: string;
  sub: string;
  searchParams: CatalogSearch;
}): Promise<Metadata> {
  const cat = opts.cat.trim();
  const sub = opts.sub.trim();
  const tag = opts.searchParams.tag?.trim() || '';
  const collection = opts.searchParams.collection?.trim() || '';

  const [categories, tags, collectionRow] = await Promise.all([
    cat || sub ? fetchPublicCategories() : Promise.resolve([]),
    tag ? fetchPublicCatalogTags() : Promise.resolve([]),
    collection ? fetchPublicCollection(collection) : Promise.resolve(null),
  ]);

  let label = 'Каталог';
  if (collectionRow) {
    label = collectionRow.name;
  } else if (tag) {
    const known = tags.find((t) => t.slug === tag);
    if (known) label = known.name;
  } else if (cat) {
    const root = categories.find((c) => c.slug === cat);
    if (root && sub) {
      label = root.children?.find((c) => c.slug === sub)?.name ?? root.name;
    } else if (root) {
      label = root.name;
    }
  }

  const title = label === 'Каталог' ? 'Каталог — Jcos' : `${label} — Jcos`;
  const path = catalogPath(cat, sub);
  // SEO-лендинги: collection/tag в canonical; sale/price/page — нет (фильтры).
  const seoQs = new URLSearchParams();
  if (collection) seoQs.set('collection', collection);
  if (tag) seoQs.set('tag', tag);
  const seoPath = seoQs.toString() ? `${path}?${seoQs}` : path;
  const url = `${siteOrigin()}${seoPath}`;

  return {
    title,
    description: `Купить ${label.toLowerCase()} в Jcos`,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      url,
      title: label,
      description: `Купить ${label.toLowerCase()} в Jcos`,
      images: collectionRow?.coverImageUrl
        ? [{ url: collectionRow.coverImageUrl, alt: collectionRow.name }]
        : undefined,
    },
  };
}

export async function loadCatalogPage(opts: {
  cat: string;
  sub: string;
  searchParams: CatalogSearch;
}) {
  const cat = opts.cat.trim();
  const sub = opts.sub.trim();
  const tag = opts.searchParams.tag?.trim() || '';
  const collection = opts.searchParams.collection?.trim() || '';
  const sale = opts.searchParams.sale === '1';
  const priceMin = opts.searchParams.priceMin
    ? Number(opts.searchParams.priceMin)
    : undefined;
  const priceMax = opts.searchParams.priceMax
    ? Number(opts.searchParams.priceMax)
    : undefined;
  const page = Math.max(1, Number(opts.searchParams.page) || 1);

  const [categories, tags, productsPage, collectionRow] = await Promise.all([
    fetchPublicCategories(),
    fetchPublicCatalogTags(),
    fetchPublicProductsPage({
      page,
      limit: PUBLIC_CATALOG_PAGE_SIZE,
      category: sub || cat || undefined,
      tag: tag || undefined,
      collection: collection || undefined,
      sort: 'newest',
      sale,
      priceMin: Number.isFinite(priceMin) ? priceMin : undefined,
      priceMax: Number.isFinite(priceMax) ? priceMax : undefined,
    }),
    collection ? fetchPublicCollection(collection) : Promise.resolve(null),
  ]);

  const notice = resolveNotice({
    cat,
    sub,
    tag,
    collection,
    categories,
    tags,
    collectionOk: !collection || collectionRow != null,
    productsOk: productsPage != null,
  });

  const rootKnown = !cat || categories.some((c) => c.slug === cat);
  const subKnown =
    !sub ||
    Boolean(
      categories.find((c) => c.slug === cat)?.children?.some((c) => c.slug === sub),
    );
  const tagKnown = !tag || tags.some((t) => t.slug === tag);
  const collectionKnown = !collection || collectionRow != null;
  const filtersKnown = rootKnown && subKnown && tagKnown && collectionKnown;

  const safePage =
    productsPage && filtersKnown && notice !== 'api'
      ? productsPage
      : { items: [], total: 0, page: 1, limit: PUBLIC_CATALOG_PAGE_SIZE };

  return {
    categories,
    tags,
    notice,
    initial: {
      items: safePage.items,
      total: safePage.total,
      page: safePage.page,
      limit: safePage.limit,
      cat: rootKnown ? cat : '',
      sub: rootKnown && subKnown ? sub : '',
      tag: tagKnown ? tag : '',
      collection: collectionKnown ? collection : '',
      collectionName: collectionRow?.name ?? null,
      sale,
      priceMin: Number.isFinite(priceMin) ? priceMin! : null,
      priceMax: Number.isFinite(priceMax) ? priceMax! : null,
    },
  };
}
