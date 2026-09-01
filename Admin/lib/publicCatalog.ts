import { cache } from 'react';
import { getServerApiBase } from './serverApiBase';
import type { ProductCardProps } from '@/components/ProductCard/ProductCard';

export type PublicProductImage = {
  id: string;
  url: string;
  sortOrder: number;
  mediaType?: 'image' | 'video';
};

export type PublicProductVariant = {
  id: string;
  name: string;
  slug: string;
  volumeMl: number | null;
  sku: string;
  price: number;
  compareAt: number | null;
  orderMinQty: number;
  orderMaxQty: number | null;
  stock: number;
  stockReserve: number;
  available: number;
  images: PublicProductImage[];
  shades: { id: string; name: string; imageUrl: string | null; sortOrder: number }[];
};

export type PublicProduct = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  pageShortDescriptionHtml: string | null;
  descriptionHtml: string | null;
  actionEffectHtml: string | null;
  applicationHtml: string | null;
  compositionHtml: string | null;
  importantNoteHtml: string | null;
  mirafloresNoteHtml: string | null;
  storageHtml: string | null;
  productType: string | null;
  purpose: string | null;
  shelfLife: string | null;
  extraHtml: string | null;
  category: {
    id: string;
    name: string;
    slug: string;
    parent: { id: string; name: string; slug: string } | null;
  };
  images: PublicProductImage[];
  variants: PublicProductVariant[];
  minPrice: number | null;
  maxPrice: number | null;
};

export type PublicSetSibling = {
  id: string;
  variantId?: string | null;
  variantName?: string | null;
  shadeId?: string | null;
  shadeName?: string | null;
  slug: string;
  name: string;
  shortDescription: string | null;
  price: number;
  oldPrice: number | null;
  discountPercent: number | null;
  /** true, если у товара разные цены вариантов — на карточке «от» */
  priceFrom?: boolean;
  available?: number;
  minQty?: number;
  maxQty?: number;
  imageUrl: string | null;
  imageUrls?: string[];
  mediaType?: 'image' | 'video' | null;
};

export type PublicProductCard = PublicSetSibling;

export type PublicCollectionCard = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  coverImageUrl: string | null;
  productPreviewUrl: string | null;
  featuredLayout?: boolean;
  products?: PublicProductCard[];
};

/** ISR window for public catalog fetches (seconds). On-demand: POST /api/admin/revalidate-catalog. */
const PUBLIC_CATALOG_REVALIDATE = 120;
const PUBLIC_CATALOG_FETCH_TAGS = ['catalog'] as const;

async function publicGet<T>(path: string): Promise<T | null> {
  const url = `${getServerApiBase()}/${path.replace(/^\//, '')}`;
  try {
    const res = await fetch(url, {
      next: {
        revalidate: PUBLIC_CATALOG_REVALIDATE,
        tags: [...PUBLIC_CATALOG_FETCH_TAGS],
      },
      headers: { Accept: 'application/json' },
    });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function fetchPublicProduct(slug: string) {
  return publicGet<PublicProduct>(`catalog/products/${encodeURIComponent(slug)}`);
}

/** Default page size for storefront catalog (mirrors backend PUBLIC_PRODUCTS_DEFAULT_LIMIT). */
export const PUBLIC_CATALOG_PAGE_SIZE = 48;

export function toProductCardProps(p: PublicProductCard): ProductCardProps {
  return {
    productId: p.id,
    variantId: p.variantId,
    variantName: p.variantName,
    shadeId: p.shadeId,
    shadeName: p.shadeName,
    slug: p.slug,
    name: p.name,
    shortDescription: p.shortDescription,
    price: p.price,
    oldPrice: p.oldPrice,
    discountPercent: p.discountPercent,
    priceFrom: p.priceFrom,
    minQty: p.minQty,
    maxQty: p.maxQty,
    available: p.available,
    imageUrl: p.imageUrl,
    imageUrls: p.imageUrls,
    mediaType: p.mediaType,
  };
}

export type FetchPublicProductsOpts = {
  page?: number;
  limit?: number;
  category?: string;
  tag?: string;
  collection?: string;
  sort?: string;
  priceMin?: number;
  priceMax?: number;
  sale?: boolean;
};

export type PublicProductsPage = {
  items: PublicProductCard[];
  total: number;
  page: number;
  limit: number;
};

export async function fetchPublicProductsPage(
  opts: FetchPublicProductsOpts = {},
): Promise<PublicProductsPage | null> {
  const params = new URLSearchParams();
  if (opts.page != null) params.set('page', String(opts.page));
  if (opts.limit != null) params.set('limit', String(opts.limit));
  if (opts.category) params.set('category', opts.category);
  if (opts.tag) params.set('tag', opts.tag);
  if (opts.collection) params.set('collection', opts.collection);
  if (opts.sort) params.set('sort', opts.sort);
  if (opts.priceMin != null) params.set('priceMin', String(opts.priceMin));
  if (opts.priceMax != null) params.set('priceMax', String(opts.priceMax));
  if (opts.sale) params.set('sale', '1');
  const qs = params.toString();
  return publicGet<PublicProductsPage>(`catalog/products${qs ? `?${qs}` : ''}`);
}

export async function fetchPublicProducts(
  opts: FetchPublicProductsOpts = {},
): Promise<PublicProductCard[]> {
  const data = await fetchPublicProductsPage(opts);
  return data?.items ?? [];
}

export type PublicCategoryNode = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  imageUrl: string | null;
  children?: PublicCategoryNode[];
};

export const fetchPublicCategories = cache(async (): Promise<PublicCategoryNode[]> => {
  const data = await publicGet<{ items: PublicCategoryNode[] }>('catalog/categories');
  return data?.items ?? [];
});

export type PublicCatalogTag = {
  id: string;
  name: string;
  slug: string;
  coverImageUrl: string | null;
};

export const fetchPublicCatalogTags = cache(async (): Promise<PublicCatalogTag[]> => {
  const data = await publicGet<{ items: PublicCatalogTag[] }>('catalog/tags');
  return data?.items ?? [];
});

export const fetchPublicCollections = cache(async (): Promise<PublicCollectionCard[]> => {
  const data = await publicGet<{ items: PublicCollectionCard[] }>('catalog/collections');
  return data?.items ?? [];
});

export async function fetchPublicCollection(
  slug: string,
): Promise<PublicCollectionCard | null> {
  const items = await fetchPublicCollections();
  return items.find((c) => c.slug === slug) ?? null;
}

export async function fetchPublicSetSiblings(slug: string): Promise<PublicSetSibling[]> {
  const data = await publicGet<{ items: PublicSetSibling[] }>(
    `catalog/products/${encodeURIComponent(slug)}/set-siblings`,
  );
  return data?.items ?? [];
}

export function formatRub(value: number): string {
  return `${value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} р.`;
}

export function stripHtml(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function discountPercent(price: number, compareAt: number | null): number | null {
  if (compareAt == null || compareAt <= price) return null;
  return Math.round(((compareAt - price) / compareAt) * 100);
}
