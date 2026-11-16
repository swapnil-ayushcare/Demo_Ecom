import { catalogueService } from '@/server/catalogue/service';
import type { Category, Product } from '@/server/catalogue/types';

/**
 * Categories that currently have something on the shelf. The home page and the
 * shop header read this, so an aisle disappears from the front door when every
 * product in it is archived.
 */
export async function listCatalogueCategories(): Promise<Category[]> {
  const categories = await catalogueService.listCategories();
  return categories.filter((category) => category.productCount > 0);
}

/**
 * The active products the shop currently offers. Archived products never reach
 * the storefront; prices come from the latest price ledger row.
 */
export async function listFeaturedProducts(): Promise<Product[]> {
  return catalogueService.listProducts();
}

export interface HomeCatalogue {
  categories: Category[];
  products: Product[];
  lowestPricePaise: number;
}

export async function loadHomeCatalogue(): Promise<HomeCatalogue> {
  const [categories, products] = await Promise.all([
    listCatalogueCategories(),
    listFeaturedProducts(),
  ]);

  return {
    categories,
    products,
    lowestPricePaise:
      products.length > 0 ? Math.min(...products.map((product) => product.pricePaise)) : 0,
  };
}
