'use client';

import Link from 'next/link';
import type { PublicCategoryNode } from '@/lib/publicCatalog';
import { catalogHref } from './catalogHref';
import styles from './CatalogPage.module.css';

function BubbleFace({
  imageUrl,
  label,
}: {
  imageUrl: string | null | undefined;
  label: string;
}) {
  return (
    <>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.bubbleImg} src={imageUrl} alt="" />
      ) : (
        <span className={styles.bubblePh} aria-hidden />
      )}
      <span className={styles.bubbleLabel}>{label}</span>
    </>
  );
}

function isParentActive(
  b: PublicCategoryNode,
  selectedRoot: PublicCategoryNode | null,
  cat: string,
  sub: string,
): boolean {
  const childActive =
    Boolean(sub) && (b.children ?? []).some((ch) => ch.slug === sub);
  if (selectedRoot) return sub === b.slug || childActive;
  return (cat === b.slug && !sub) || (cat === b.slug && childActive);
}

function activeKidsParent(
  bubbles: PublicCategoryNode[],
  selectedRoot: PublicCategoryNode | null,
  cat: string,
  sub: string,
): PublicCategoryNode | null {
  return (
    bubbles.find(
      (b) =>
        (b.children?.length ?? 0) > 0 &&
        isParentActive(b, selectedRoot, cat, sub),
    ) ?? null
  );
}

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

  const kidsParent = activeKidsParent(bubbles, selectedRoot, cat, sub);
  const childBubbles = kidsParent?.children ?? [];

  return (
    <div className={styles.bubblesWrap}>
      <ul className={styles.bubbles} role="list">
        {selectedRoot ? (
          <li>
            {!sub ? (
              <span className={styles.bubble} data-active aria-current="page">
                <BubbleFace imageUrl={selectedRoot.imageUrl} label="Все" />
              </span>
            ) : (
              <Link
                href={catalogHref(
                  searchParams,
                  { sub: null, q: null, collection: null },
                  path,
                )}
                className={styles.bubble}
              >
                <BubbleFace imageUrl={selectedRoot.imageUrl} label="Все" />
              </Link>
            )}
          </li>
        ) : null}
        {bubbles.map((b) => {
          const childActive =
            Boolean(sub) && (b.children ?? []).some((ch) => ch.slug === sub);
          const active = selectedRoot
            ? sub === b.slug || childActive
            : cat === b.slug && !sub
              ? true
              : cat === b.slug && childActive;
          const href = selectedRoot
            ? catalogHref(
                searchParams,
                { sub: b.slug, q: null, collection: null },
                path,
              )
            : catalogHref(
                searchParams,
                { cat: b.slug, sub: null, q: null, collection: null },
                path,
              );
          return (
            <li key={b.id}>
              {active && !childActive ? (
                <span className={styles.bubble} data-active aria-current="page">
                  <BubbleFace imageUrl={b.imageUrl} label={b.name} />
                </span>
              ) : (
                <Link
                  href={href}
                  className={styles.bubble}
                  {...(active ? { 'data-active': true } : {})}
                >
                  <BubbleFace imageUrl={b.imageUrl} label={b.name} />
                </Link>
              )}
            </li>
          );
        })}
      </ul>

      {childBubbles.length > 0 && kidsParent ? (
        <ul
          className={`${styles.bubbles} ${styles.bubbleKids}`}
          role="list"
          aria-label={`${kidsParent.name}: подкатегории`}
        >
          {childBubbles.map((ch) => {
            const active = selectedRoot
              ? sub === ch.slug
              : cat === kidsParent.slug && sub === ch.slug;
            const href = selectedRoot
              ? catalogHref(
                  searchParams,
                  { sub: ch.slug, q: null, collection: null },
                  path,
                )
              : catalogHref(
                  searchParams,
                  {
                    cat: kidsParent.slug,
                    sub: ch.slug,
                    q: null,
                    collection: null,
                  },
                  path,
                );
            return (
              <li key={ch.id}>
                {active ? (
                  <span className={styles.bubble} data-active aria-current="page">
                    <BubbleFace imageUrl={ch.imageUrl} label={ch.name} />
                  </span>
                ) : (
                  <Link href={href} className={styles.bubble}>
                    <BubbleFace imageUrl={ch.imageUrl} label={ch.name} />
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
