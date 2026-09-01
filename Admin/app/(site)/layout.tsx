import { SiteProviders } from '@/components/SiteProviders/SiteProviders';
import {
  fetchPublicCatalogTags,
  fetchPublicCategories,
} from '@/lib/publicCatalog';
import { SiteShell } from './SiteShell';

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [categories, tags] = await Promise.all([
    fetchPublicCategories(),
    fetchPublicCatalogTags(),
  ]);

  return (
    <SiteProviders catalogNav={{ categories, tags }}>
      <SiteShell>{children}</SiteShell>
    </SiteProviders>
  );
}
