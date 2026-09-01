'use client';

import Link from 'next/link';
import type { PublicCategoryNode } from '@/lib/publicCatalog';
import { catalogHref } from './catalogHref';
import styles from './CatalogPage.module.css';

export function CatalogBubbles({
  bubbles,
  selectedRoot,
  cat,
  sub,
  searchParams,
  path,
}: {
  bubbles: PublicCategoryNode[];
  selectedRoot: PublicCategoryNode | null;
  cat: string;
  sub: string;
  searchParams: URLSearchParams;
  path: { cat?: string; sub?: string };
}) {
  if (bubbles.length === 0) return null;

  return (
    <div className={styles.bubblesWrap}>
      <ul className={styles.bubbles} role="list">
        {selectedRoot ? (
          <li>
            {!sub ? (
              <span className={styles.bubble} data-active>
                <span className={styles.bubblePh} aria-hidden />
                <span className={styles.bubbleLabel}>все</span>
              </span>
            ) : (
              <Link
                href={catalogHref(searchParams, { sub: null }, path)}
                className={styles.bubble}
              >
                <span className={styles.bubblePh} aria-hidden />
                <span className={styles.bubbleLabel}>все</span>
              </Link>
            )}
          </li>
        ) : null}
        {bubbles.map((b) => {
          const active = selectedRoot ? sub === b.slug : cat === b.slug;
          const href = selectedRoot
            ? catalogHref(searchParams, { sub: b.slug }, path)
            : catalogHref(searchParams, { cat: b.slug, sub: null }, path);
          return (
            <li key={b.id}>
              {active ? (
                <span className={styles.bubble} data-active>
                  {b.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className={styles.bubbleImg} src={b.imageUrl} alt="" />
                  ) : (
                    <span className={styles.bubblePh} aria-hidden />
                  )}
                  <span className={styles.bubbleLabel}>{b.name}</span>
                </span>
              ) : (
                <Link href={href} className={styles.bubble}>
                  {b.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className={styles.bubbleImg} src={b.imageUrl} alt="" />
                  ) : (
                    <span className={styles.bubblePh} aria-hidden />
                  )}
                  <span className={styles.bubbleLabel}>{b.name}</span>
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
