import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { formatBlogDateRu } from '@/lib/blogPublic';
import { loadBlogPostBySlug } from '@/lib/blogPublicServer';
import styles from './ArticlePage.module.css';

export const revalidate = 120;

function safeDecodeSlug(raw: string): string {
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}

function siteOrigin(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    '';
  return fromEnv.replace(/\/+$/, '') || 'http://localhost:3000';
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const slug = safeDecodeSlug(params.slug);
  if (!slug) return { title: 'Статья — Jcos' };
  const post = await loadBlogPostBySlug(slug);
  if (!post) return { title: 'Статья не найдена — Jcos' };
  const description = post.excerpt?.trim() || undefined;
  return {
    title: `${post.title} — Блог — Jcos`,
    description,
    openGraph: {
      title: post.title,
      description,
      type: 'article',
      ...(post.coverUrl ? { images: [{ url: post.coverUrl }] } : {}),
    },
  };
}

export default async function BlogArticlePage({ params }: { params: { slug: string } }) {
  const slug = safeDecodeSlug(params.slug);
  if (!slug) notFound();
  const post = await loadBlogPostBySlug(slug);
  if (!post) notFound();

  const dateLine = formatBlogDateRu(post.publishedAt);
  const pageUrl = `${siteOrigin()}/blog/${post.slug}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.excerpt?.trim() || undefined,
    image: post.coverUrl ? [post.coverUrl] : undefined,
    datePublished: post.publishedAt ?? undefined,
    author: post.author?.displayName
      ? { '@type': 'Person', name: post.author.displayName }
      : { '@type': 'Organization', name: 'Jcos' },
    publisher: { '@type': 'Organization', name: 'Jcos' },
    mainEntityOfPage: pageUrl,
    url: pageUrl,
  };

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
        }}
      />
      <article className={styles.section} aria-label="Статья">
        <div className="padding-global">
          <Link href="/blog" className={styles.backLink}>
            <svg
              className={styles.backLinkIcon}
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
            <span className={styles.backLinkLabel}>Блог</span>
          </Link>

          <div className={styles.body}>
            {dateLine ? <time className={styles.date}>{dateLine}</time> : null}
            <h1 className={styles.title}>{post.title}</h1>
            {post.category ? (
              <Link
                href={`/blog?category=${encodeURIComponent(post.category.slug)}`}
                className={styles.category}
              >
                {post.category.name}
              </Link>
            ) : null}
            {post.excerpt?.trim() ? <p className={styles.lead}>{post.excerpt.trim()}</p> : null}
          </div>

          {post.coverUrl ? (
            <div className={styles.hero}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={post.coverUrl}
                alt=""
                className={styles.heroImg}
              />
            </div>
          ) : null}

          <div
            className={styles.body}
            dangerouslySetInnerHTML={{ __html: post.body }}
          />
        </div>
      </article>
    </main>
  );
}
