import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ContentPage, contentPageStyles as styles } from '../content/ContentPage';
import { fetchPublicCmsPage } from '@/lib/cmsPublicServer';
import { sanitizeProductHtml } from '@/lib/sanitizeProductHtml';

export async function generateMetadata(): Promise<Metadata> {
  const page = await fetchPublicCmsPage('about');
  return {
    title: page ? `${page.title} — Jcos` : 'О нас — Jcos',
  };
}

export default async function AboutPage() {
  const page = await fetchPublicCmsPage('about');
  if (!page) notFound();

  return (
    <ContentPage title={page.title}>
      <div
        className={styles.prose}
        dangerouslySetInnerHTML={{ __html: sanitizeProductHtml(page.bodyHtml) }}
      />
    </ContentPage>
  );
}
