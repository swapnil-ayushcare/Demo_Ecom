import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { AppShell } from '@/components/ui/AppShell';
import { listCatalogueCategories } from '@/features/catalogue/home/queries';
import { CategoryPage } from '@/features/catalogue/category/CategoryPage';
import { getCategoryWithProducts } from '@/features/catalogue/category/queries';
import { getFeatureNavigation } from '@/server/features/registry';

export const dynamic = 'force-dynamic';

const loadCategory = cache(getCategoryWithProducts);

interface PageProps {
  params: { slug: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const catalogue = await loadCategory(params.slug);
  if (!catalogue) {
    return { title: 'Aisle not found' };
  }
  return {
    title: catalogue.category.name,
    description:
      catalogue.category.description ||
      `Browse ${catalogue.category.name} at Demo_Ecom, with every price in rupees.`,
  };
}

export default async function CategoryRoute({ params }: PageProps) {
  const catalogue = await loadCategory(params.slug);
  if (!catalogue) {
    notFound();
  }

  const [categories, featureNav] = await Promise.all([
    listCatalogueCategories(),
    Promise.resolve(getFeatureNavigation('shop')),
  ]);

  return (
    <AppShell
      categories={categories}
      featureNav={featureNav}
      activeCategory={catalogue.category.slug}
    >
      <CategoryPage category={catalogue.category} products={catalogue.products} />
    </AppShell>
  );
}
