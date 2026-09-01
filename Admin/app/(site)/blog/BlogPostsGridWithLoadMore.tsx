'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { PublicBlogPostCard } from '@/lib/blogPublic';
import { BLOG_LIST_PAGE_SIZE, formatBlogDateRu } from '@/lib/blogPublic';
import styles from './BlogPage.module.css';

type Props = {
  initialItems: PublicBlogPostCard[];
  total: number;
  categorySlug?: string;
  initialLoadedPages: number;
};

export function BlogPostsGridWithLoadMore({
  initialItems,
  total,
  categorySlug,
  initialLoadedPages,
}: Props) {
  const [items, setItems] = useState(initialItems);
  const [page, setPage] = useState(initialLoadedPages);
  const [loading, setLoading] = useState(false);
  const hasMore = items.length < total;

  useEffect(() => {
    setItems(initialItems);
    setPage(initialLoadedPages);
  }, [initialItems, initialLoadedPages, categorySlug]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const nextPage = page + 1;
      const qs = new URLSearchParams({
        page: String(nextPage),
        limit: String(BLOG_LIST_PAGE_SIZE),
      });
      if (categorySlug) qs.set('categorySlug', categorySlug);
      const res = await fetch(`/api/public/blog/posts?${qs}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return;
      const data = (await res.json()) as { items?: PublicBlogPostCard[] };
      const next = data.items ?? [];
      setItems((prev) => [...prev, ...next]);
      setPage(nextPage);
      const url = new URL(window.location.href);
      url.searchParams.set('page', String(nextPage));
      window.history.replaceState({}, '', url.toString());
    } finally {
      setLoading(false);
    }
  }, [categorySlug, hasMore, loading, page]);

  return (
    <div>
      {items.length === 0 ? (
        <p className={styles.empty}>Статей пока нет</p>
      ) : (
        <ul className={styles.grid}>
          {items.map((post) => {
            const date = formatBlogDateRu(post.publishedAt);
            return (
              <li key={post.id} className={styles.card}>
                <Link href={`/blog/${post.slug}`} className={styles.cardLink}>
                  <span className={styles.cover}>
                    {post.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={post.coverUrl} alt="" className={styles.coverImg} />
                    ) : (
                      <span className={styles.coverPlaceholder} aria-hidden />
                    )}
                  </span>
                  <span className={styles.meta}>
                    {date}
                    {post.category ? ` · ${post.category.name}` : ''}
                  </span>
                  <span className={styles.cardTitle}>{post.title}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {hasMore ? (
        <div className={styles.loadMoreWrap}>
          <button
            type="button"
            className={styles.loadMore}
            disabled={loading}
            onClick={() => void loadMore()}
          >
            {loading ? 'Загрузка…' : 'Ещё статьи'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
