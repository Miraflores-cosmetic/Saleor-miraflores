import type { Metadata } from 'next';
import { fetchPublicCategories } from '@/lib/publicCatalog';
import { CatalogPageView } from '../CatalogPageView';
import { buildCatalogMetadata, type CatalogSearch } from '../catalogLoad';

export const revalidate = 120;

type Props = {
  params: { cat: string };
  searchParams: CatalogSearch;
};

export async function generateStaticParams() {
  const categories = await fetchPublicCategories();
  return categories.map((c) => ({ cat: c.slug }));
}

export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  return buildCatalogMetadata({
    cat: params.cat,
    sub: '',
    searchParams,
  });
}

export default async function CatalogCategoryPage({ params, searchParams }: Props) {
  return (
    <CatalogPageView cat={params.cat} sub="" searchParams={searchParams} />
  );
}
