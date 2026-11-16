import { catalogueService } from '@/server/catalogue/service';
import type { Product } from '@/server/catalogue/types';
import type { SearchFilters } from './filters';

export interface SearchOutcome {
  products: Product[];
  count: number;
}

/**
 * Read the active catalogue through the shared catalogue service. Every filter
 * is a parameter of the same query, so the phrase, aisle, rupee range and stock
 * narrow together rather than replacing one another.
 */
export async function searchCatalogue(filters: SearchFilters): Promise<SearchOutcome> {
  const products = await catalogueService.listProducts({
    search: filters.q,
    categorySlug: filters.category || undefined,
    minPricePaise: filters.minPaise ?? undefined,
    maxPricePaise: filters.maxPaise ?? undefined,
    inStockOnly: filters.inStock,
  });

  return { products, count: products.length };
}
