import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { CatalogPageView } from './CatalogPageView';
import {
  buildCatalogMetadata,
  catalogPath,
  type CatalogSearch,
} from './catalogLoad';

export const revalidate = 120;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: CatalogSearch;
}): Promise<Metadata> {
  return buildCatalogMetadata({ cat: '', sub: '', searchParams });
}

export default async function CatalogRootPage({
  searchParams,
}: {
  searchParams: CatalogSearch;
}) {
  const cat = searchParams.cat?.trim() || '';
  const sub = searchParams.sub?.trim() || '';
  if (cat) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (k === 'cat' || k === 'sub' || v == null || v === '') continue;
      sp.set(k, String(v));
    }
    const qs = sp.toString();
    redirect(qs ? `${catalogPath(cat, sub)}?${qs}` : catalogPath(cat, sub));
  }

  return <CatalogPageView cat="" sub="" searchParams={searchParams} />;
}
