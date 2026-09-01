'use client';

import Link from 'next/link';
import { useCallback, useMemo, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ProductCard } from '@/components/ProductCard/ProductCard';
import {
  PUBLIC_CATALOG_PAGE_SIZE,
  toProductCardProps,
  type PublicCatalogTag,
  type PublicCategoryNode,
  type PublicProductCard,
} from '@/lib/publicCatalog';
import { CatalogBubbles } from './CatalogBubbles';
import { CatalogFilters } from './CatalogFilters';
import { CatalogPager } from './CatalogPager';
import { catalogHref } from './catalogHref';
import styles from './CatalogPage.module.css';

export type CatalogNotice =
  | 'api'
  | 'unknown_cat'
  | 'unknown_sub'
  | 'unknown_tag'
  | 'unknown_collection';

type InitialState = {
  items: PublicProductCard[];
  total: number;
  page: number;
  limit: number;
  cat: string;
  sub: string;
  tag: string;
  collection: string;
  collectionName: string | null;
  sale: boolean;
  priceMin: number | null;
  priceMax: number | null;
};

function productsWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'продукт';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'продукта';
  return 'продуктов';
}

export function CatalogClient({
  categories,
  tags,
  initial,
  notice = null,
}: {
  categories: PublicCategoryNode[];
  tags: PublicCatalogTag[];
  initial: InitialState;
  notice?: CatalogNotice | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  // cat/sub приходят из path (/catalog/[cat]/[sub]), не из query
  const cat = initial.cat;
  const sub = initial.sub;
  const tag = searchParams.get('tag') ?? initial.tag;
  const collection = searchParams.get('collection') ?? initial.collection;
  const sale = (searchParams.get('sale') ?? (initial.sale ? '1' : '')) === '1';
  const priceMinRaw = searchParams.get('priceMin');
  const priceMaxRaw = searchParams.get('priceMax');
  const priceMin = priceMinRaw != null ? Number(priceMinRaw) : initial.priceMin;
  const priceMax = priceMaxRaw != null ? Number(priceMaxRaw) : initial.priceMax;

  const path = useMemo(() => ({ cat, sub }), [cat, sub]);

  const selectedRoot = useMemo(
    () => categories.find((c) => c.slug === cat) ?? null,
    [categories, cat],
  );
  const bubbles: PublicCategoryNode[] = selectedRoot
    ? selectedRoot.children ?? []
    : categories;

  const title = collection
    ? initial.collectionName ?? collection
    : selectedRoot
      ? sub
        ? selectedRoot.children?.find((c) => c.slug === sub)?.name ?? selectedRoot.name
        : selectedRoot.name
      : 'Каталог';

  const pageSize = initial.limit || PUBLIC_CATALOG_PAGE_SIZE;

  const patchParams = useCallback(
    (patch: Record<string, string | null>, opts?: { scroll?: boolean }) => {
      const sp = new URLSearchParams(searchParams.toString());
      sp.delete('cat');
      sp.delete('sub');
      for (const [k, v] of Object.entries(patch)) {
        if (k === 'cat' || k === 'sub') continue;
        if (v == null || v === '') sp.delete(k);
        else sp.set(k, v);
      }
      if (!('page' in patch)) sp.delete('page');
      const qs = sp.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, {
          scroll: opts?.scroll ?? false,
        });
      });
    },
    [pathname, router, searchParams],
  );

  return (
    <main className={styles.page}>
      <section id="hero-section" className={styles.hero} aria-label="Каталог">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={styles.heroImg}
          src="/images/home/catalog-cover.webp"
          alt=""
        />
        <div className={`padding-global ${styles.heroContent}`}>
          <nav className={styles.crumbs} aria-label="Навигация">
            <Link href="/">Главная</Link>
            <span aria-hidden> / </span>
            {collection ? (
              <>
                <Link href="/catalog" className={styles.crumbBtn}>
                  Каталог
                </Link>
                <span aria-hidden> / </span>
                <span>{title}</span>
              </>
            ) : selectedRoot ? (
              <>
                <Link href="/catalog" className={styles.crumbBtn}>
                  Каталог
                </Link>
                <span aria-hidden> / </span>
                {sub ? (
                  <>
                    <Link
                      href={catalogHref(searchParams, { sub: null }, path)}
                      className={styles.crumbBtn}
                    >
                      {selectedRoot.name}
                    </Link>
                    <span aria-hidden> / </span>
                    <span>{title}</span>
                  </>
                ) : (
                  <span>{selectedRoot.name}</span>
                )}
              </>
            ) : (
              <span>Каталог</span>
            )}
          </nav>
          <h1 className={styles.heroTitle}>{title}</h1>
        </div>
      </section>

      <div className={`padding-global ${styles.body}`}>
        <CatalogBubbles
          bubbles={bubbles}
          selectedRoot={selectedRoot}
          cat={cat}
          sub={sub}
          searchParams={searchParams}
          path={path}
        />

        <div className={styles.toolbar}>
          <p className={styles.count} aria-live="polite">
            {notice
              ? null
              : `${initial.total.toLocaleString('ru-RU')} ${productsWord(initial.total)}`}
          </p>
        </div>

        <CatalogFilters
          tags={tags}
          tag={tag}
          sale={sale}
          priceMin={priceMin}
          priceMax={priceMax}
          showClearCategory={Boolean(selectedRoot || collection)}
          clearCategoryLabel={
            collection ? 'сбросить коллекцию' : 'сбросить категорию'
          }
          searchParams={searchParams}
          path={path}
          patchParams={patchParams}
        />

        <div className={styles.grid} data-pending={pending || undefined}>
          {notice === 'api' ? (
            <div className={styles.empty} role="alert">
              <p className={styles.emptyText}>
                Не удалось загрузить каталог. Обновите страницу или попробуйте позже.
              </p>
            </div>
          ) : notice === 'unknown_cat' ||
            notice === 'unknown_sub' ||
            notice === 'unknown_tag' ||
            notice === 'unknown_collection' ? (
            <div className={styles.empty} role="status">
              <p className={styles.emptyText}>
                {notice === 'unknown_cat'
                  ? 'Категория не найдена.'
                  : notice === 'unknown_sub'
                    ? 'Подкатегория не найдена.'
                    : notice === 'unknown_tag'
                      ? 'Область применения не найдена.'
                      : 'Коллекция не найдена.'}
              </p>
              <Link href="/catalog" className={styles.emptyAction}>
                Сбросить фильтры
              </Link>
            </div>
          ) : initial.items.length === 0 ? (
            <div className={styles.empty} role="status">
              <p className={styles.emptyText}>Ничего не найдено</p>
              <Link
                href={catalogHref(
                  searchParams,
                  {
                    cat: null,
                    sub: null,
                    tag: null,
                    collection: null,
                    sale: null,
                    priceMin: null,
                    priceMax: null,
                  },
                  path,
                )}
                className={styles.emptyAction}
              >
                Сбросить фильтры
              </Link>
            </div>
          ) : (
            initial.items.map((p) => (
              <ProductCard key={p.id} {...toProductCardProps(p)} />
            ))
          )}
        </div>

        {!notice ? (
          <CatalogPager
            page={initial.page}
            total={initial.total}
            pageSize={pageSize}
            pending={pending}
            onPrev={() =>
              patchParams({ page: String(Math.max(1, initial.page - 1)) }, { scroll: true })
            }
            onNext={() =>
              patchParams({ page: String(initial.page + 1) }, { scroll: true })
            }
          />
        ) : null}
      </div>
    </main>
  );
}
