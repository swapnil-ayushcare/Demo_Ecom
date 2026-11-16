import { AppShell } from '@/components/ui/AppShell';
import { listCatalogueCategories } from '@/features/catalogue/home/queries';
import { getFeatureNavigation } from '@/server/features/registry';

export const dynamic = 'force-dynamic';

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const [categories, featureNav] = await Promise.all([
    listCatalogueCategories(),
    Promise.resolve(getFeatureNavigation('shop')),
  ]);

  return (
    <AppShell categories={categories} featureNav={featureNav}>
      {children}
    </AppShell>
  );
}
