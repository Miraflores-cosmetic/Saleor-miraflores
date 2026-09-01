import type { Metadata } from 'next';
import { fetchPublicCategories } from '@/lib/publicCatalog';
import { CatalogPageView } from '../../CatalogPageView';
import { buildCatalogMetadata, type CatalogSearch } from '../../catalogLoad';

export const revalidate = 120;

type Props = {
  params: { cat: string; sub: string };
  searchParams: CatalogSearch;
};

export async function generateStaticParams() {
  const categories = await fetchPublicCategories();
  return categories.flatMap((c) =>
    (c.children ?? []).map((ch) => ({ cat: c.slug, sub: ch.slug })),
  );
}

export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  return buildCatalogMetadata({
    cat: params.cat,
    sub: params.sub,
    searchParams,
  });
}

export default async function CatalogSubcategoryPage({
  params,
  searchParams,
}: Props) {
  return (
    <CatalogPageView
      cat={params.cat}
      sub={params.sub}
      searchParams={searchParams}
    />
  );
}
