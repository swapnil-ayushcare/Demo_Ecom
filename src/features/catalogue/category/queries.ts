import { query } from '@/server/db';
import { catalogueService } from '@/server/catalogue/service';
import type { Category, Product } from '@/server/catalogue/types';

interface CategoryLookupRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sort_order: number;
  product_count: number;
}

export interface CategoryCatalogue {
  category: Category;
  products: Product[];
}

/**
 * Resolve one aisle by its stable slug and read only the active products on
 * that shelf. An unknown slug resolves to null so the route can render the
 * shop's not-found page. A category with nothing active still resolves, which
 * lets the page draw its empty state instead of a broken grid.
 */
export async function getCategoryWithProducts(
  slug: string,
): Promise<CategoryCatalogue | null> {
  const result = await query<CategoryLookupRow>(
    `SELECT c.id, c.slug, c.name, c.description, c.sort_order,
            (
              SELECT COUNT(*)::int
                FROM products p
               WHERE p.category_id = c.id
                 AND COALESCE(
                       (
                         SELECT status
                           FROM product_status_events
                          WHERE product_id = p.id
                          ORDER BY created_at DESC, id DESC
                          LIMIT 1
                       ),
                       'active'
                     ) <> 'archived'
            ) AS product_count
       FROM categories c
      WHERE c.slug = $1
      LIMIT 1`,
    [slug],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  const category: Category = {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? '',
    sortOrder: row.sort_order,
    productCount: row.product_count,
  };

  const products = await catalogueService.listProducts({ categorySlug: row.slug });
  return { category, products };
}
