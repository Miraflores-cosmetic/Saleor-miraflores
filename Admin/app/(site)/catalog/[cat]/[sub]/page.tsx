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
  const params: { cat: string; sub: string }[] = [];
  for (const c of categories) {
    for (const ch of c.children ?? []) {
      params.push({ cat: c.slug, sub: ch.slug });
      for (const gr of ch.children ?? []) {
        params.push({ cat: c.slug, sub: gr.slug });
      }
    }
  }
  return params;
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
