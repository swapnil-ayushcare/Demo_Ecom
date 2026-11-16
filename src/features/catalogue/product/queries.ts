import { catalogueService } from '@/server/catalogue/service';
import type { Product } from '@/server/catalogue/types';

/**
 * One product for the detail page. A missing slug and an archived product
 * both resolve to null, so the route can answer with the not-found page
 * instead of an error.
 */
export async function getProductDetail(slug: string): Promise<Product | null> {
  const clean = slug.trim();
  if (clean.length === 0) {
    return null;
  }

  return catalogueService.getProductBySlug(clean);
}
