import Link from 'next/link';
import type { Metadata } from 'next';
import { BLOG_LIST_PAGE_SIZE } from '@/lib/blogPublic';
import {
  fetchBlogCategoriesPublic,
  fetchBlogPostsThroughPages,
} from '@/lib/blogPublicServer';
import { BlogPostsGridWithLoadMore } from './BlogPostsGridWithLoadMore';
import styles from './BlogPage.module.css';

export const metadata: Metadata = {
  title: 'Блог — Jcos',
  description: 'Статьи, события и материалы Jcos',
  openGraph: {
    title: 'Блог — Jcos',
    description: 'Статьи, события и материалы Jcos',
    type: 'website',
  },
};

export const revalidate = 120;

type Props = {
  searchParams: { category?: string; page?: string };
};

function parsePage(raw: string | undefined): number {
  if (raw == null || raw === '') return 1;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

export default async function BlogPage({ searchParams }: Props) {
  const categoryParam =
    typeof searchParams.category === 'string' ? searchParams.category.trim() : '';
  const pageParam = parsePage(searchParams.page);
  const categories = await fetchBlogCategoriesPublic();
  const categoryKnown =
    !categoryParam || categories.some((c) => c.slug === categoryParam);
  const activeCategorySlug =
    categoryParam && categoryKnown ? categoryParam : undefined;

  const listing =
    categoryParam && !categoryKnown
      ? { items: [], total: 0, limit: BLOG_LIST_PAGE_SIZE, loadedPages: 1 }
      : await fetchBlogPostsThroughPages({
          categorySlug: activeCategorySlug,
          throughPage: pageParam,
          pageSize: BLOG_LIST_PAGE_SIZE,
        });

  const tabs: { slug: string; label: string; isAll: boolean }[] = [
    { slug: '', label: 'Все статьи', isAll: true },
    ...categories.map((c) => ({ slug: c.slug, label: c.name, isAll: false })),
  ];

  return (
    <main>
      <section className={styles.section} aria-label="Блог">
        <div className="padding-global">
          <nav className={styles.breadcrumbs} aria-label="Хлебные крошки">
            <Link href="/" className={styles.breadcrumbsLink}>
              Главная
            </Link>
            <span className={styles.breadcrumbsSep}>/</span>
            <span className={styles.breadcrumbsCurrent}>Блог</span>
          </nav>
          <nav className={styles.breadcrumbsMobile} aria-label="Хлебные крошки">
            <Link href="/" className={styles.breadcrumbsBack}>
              <svg
                className={styles.breadcrumbsBackIcon}
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden
              >
                <path
                  d="M10 3.5 5.5 8 10 12.5"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className={styles.breadcrumbsBackLabel}>Главная</span>
            </Link>
          </nav>

          <h1 className={styles.title}>Блог</h1>

          <div className={styles.tabs} role="tablist" aria-label="Рубрики блога">
            {tabs.map((tab) => {
              const isActive = tab.isAll ? !activeCategorySlug : activeCategorySlug === tab.slug;
              const href = tab.isAll
                ? '/blog'
                : `/blog?category=${encodeURIComponent(tab.slug)}`;
              return isActive ? (
                <span
                  key={tab.isAll ? 'all' : tab.slug}
                  role="tab"
                  aria-selected
                  className={styles.tabActive}
                >
                  {tab.label}
                </span>
              ) : (
                <Link
                  key={tab.isAll ? 'all' : tab.slug}
                  href={href}
                  role="tab"
                  aria-selected={false}
                  className={styles.tab}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>

          <BlogPostsGridWithLoadMore
            key={activeCategorySlug ?? 'all'}
            initialItems={listing.items}
            total={listing.total}
            categorySlug={activeCategorySlug}
            initialLoadedPages={listing.loadedPages}
          />
        </div>
      </section>
    </main>
  );
}
