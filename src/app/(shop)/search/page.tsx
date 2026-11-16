import type { Metadata } from 'next';
import { listCatalogueCategories } from '@/features/catalogue/home/queries';
import { SearchPage } from '@/features/catalogue/search/SearchPage';
import {
  parseSearchFilters,
  type SearchParamsRecord,
} from '@/features/catalogue/search/filters';
import { searchCatalogue } from '@/features/catalogue/search/searchCatalogue';
import type { Product } from '@/server/catalogue/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Search the shop',
  description:
    'Search the shop by name or description, then narrow the shelf by category, rupee range and what is in stock.',
};

interface SearchRouteProps {
  searchParams: SearchParamsRecord;
}

export default async function SearchRoute({ searchParams }: SearchRouteProps) {
  const { filters, errors } = parseSearchFilters(searchParams);
  const invalid = Object.values(errors).some(Boolean);

  const categories = await listCatalogueCategories();
  let products: Product[] = [];
  if (!invalid) {
    const outcome = await searchCatalogue(filters);
    products = outcome.products;
  }

  return (
    <SearchPage
      filters={filters}
      errors={errors}
      categories={categories}
      products={products}
    />
  );
}
