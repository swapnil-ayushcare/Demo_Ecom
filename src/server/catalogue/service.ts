import { query, withTransaction } from '../db';
import type {
  Category,
  CategoryRow,
  Product,
  ProductContentInput,
  ProductListOptions,
  ProductRow,
} from './types';

const PRODUCT_SELECT = `
  SELECT
    p.id,
    p.slug,
    p.name,
    p.description,
    c.id AS category_id,
    c.slug AS category_slug,
    c.name AS category_name,
    COALESCE(pr.amount_paise, 0) AS price_paise,
    COALESCE(sl.quantity, 0) AS stock_quantity,
    st.status,
    img.images
  FROM products p
  JOIN categories c ON c.id = p.category_id
  LEFT JOIN LATERAL (
    SELECT amount_paise
      FROM product_prices
     WHERE product_id = p.id
     ORDER BY created_at DESC, id DESC
     LIMIT 1
  ) pr ON true
  LEFT JOIN stock_levels sl ON sl.product_id = p.id
  LEFT JOIN LATERAL (
    SELECT status
      FROM product_status_events
     WHERE product_id = p.id
     ORDER BY created_at DESC, id DESC
     LIMIT 1
  ) st ON true
  LEFT JOIN LATERAL (
    SELECT json_agg(
             json_build_object(
               'id', pi.id,
               'url', pi.url,
               'alt', pi.alt,
               'position', pi.position
             )
             ORDER BY pi.position, pi.id
           ) AS images
      FROM product_images pi
     WHERE pi.product_id = p.id
  ) img ON true
`;

function mapCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? '',
    sortOrder: row.sort_order,
    productCount: row.product_count,
  };
}

function mapProduct(row: ProductRow): Product {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? '',
    category: {
      id: row.category_id,
      slug: row.category_slug,
      name: row.category_name,
    },
    pricePaise: row.price_paise,
    stockQuantity: row.stock_quantity,
    inStock: row.stock_quantity > 0,
    archived: row.status === 'archived',
    images: (row.images ?? []).map((image) => ({
      id: image.id,
      url: image.url,
      alt: image.alt,
      position: image.position,
    })),
  };
}

/** Escape a user phrase for a parameterized ILIKE comparison. */
function likePattern(phrase: string): string {
  return `%${phrase.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

export async function listCategories(): Promise<Category[]> {
  const result = await query<CategoryRow>(
    `SELECT c.id, c.slug, c.name, c.description, c.sort_order,
            COUNT(p.id)::int AS product_count
       FROM categories c
       LEFT JOIN products p ON p.category_id = c.id
       LEFT JOIN LATERAL (
         SELECT status
           FROM product_status_events
          WHERE product_id = p.id
          ORDER BY created_at DESC, id DESC
          LIMIT 1
       ) st ON true
      WHERE COALESCE(st.status, 'active') <> 'archived'
      GROUP BY c.id
      ORDER BY c.sort_order ASC, c.name ASC`,
  );
  return result.rows.map(mapCategory);
}

export async function listProducts(options: ProductListOptions = {}): Promise<Product[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (!options.includeArchived) {
    conditions.push(`COALESCE(st.status, 'active') <> 'archived'`);
  }

  if (options.categorySlug) {
    params.push(options.categorySlug);
    conditions.push(`c.slug = $${params.length}`);
  }

  if (options.search && options.search.trim().length > 0) {
    params.push(likePattern(options.search.trim()));
    const position = params.length;
    conditions.push(
      `(p.name ILIKE $${position} ESCAPE '\\' OR p.description ILIKE $${position} ESCAPE '\\' OR c.name ILIKE $${position} ESCAPE '\\')`,
    );
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await query<ProductRow>(
    `${PRODUCT_SELECT} ${where} ORDER BY p.name ASC, p.id ASC`,
    params,
  );
  return result.rows.map(mapProduct);
}

export async function getProductBySlug(
  slug: string,
  options: { includeArchived?: boolean } = {},
): Promise<Product | null> {
  const archivedClause = options.includeArchived
    ? ''
    : `AND COALESCE(st.status, 'active') <> 'archived'`;
  const result = await query<ProductRow>(
    `${PRODUCT_SELECT} WHERE p.slug = $1 ${archivedClause} LIMIT 1`,
    [slug],
  );
  const row = result.rows[0];
  return row ? mapProduct(row) : null;
}

export async function getProductById(id: string): Promise<Product | null> {
  const result = await query<ProductRow>(`${PRODUCT_SELECT} WHERE p.id = $1 LIMIT 1`, [id]);
  const row = result.rows[0];
  return row ? mapProduct(row) : null;
}

export async function createCategory(input: {
  slug: string;
  name: string;
  description?: string;
  sortOrder?: number;
}): Promise<Category> {
  const result = await query<CategoryRow>(
    `INSERT INTO categories (slug, name, description, sort_order)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (slug) DO UPDATE
       SET name = EXCLUDED.name,
           description = EXCLUDED.description,
           sort_order = EXCLUDED.sort_order
     RETURNING id, slug, name, description, sort_order, 0::int AS product_count`,
    [input.slug, input.name, input.description ?? '', input.sortOrder ?? 0],
  );
  return mapCategory(result.rows[0]);
}

export async function setProductImages(
  productId: string,
  images: Array<{ url: string; alt?: string }>,
): Promise<void> {
  await withTransaction(async (client) => {
    await client.query('DELETE FROM product_images WHERE product_id = $1', [productId]);
    for (const [position, image] of images.entries()) {
      await client.query(
        `INSERT INTO product_images (product_id, url, alt, position)
         VALUES ($1, $2, $3, $4)`,
        [productId, image.url, image.alt ?? '', position],
      );
    }
  });
}

export async function setProductPrice(productId: string, amountPaise: number): Promise<void> {
  if (!Number.isSafeInteger(amountPaise) || amountPaise < 0) {
    throw new TypeError('price must be a non-negative integer number of paise');
  }

  const current = await query<{ amount_paise: number }>(
    `SELECT amount_paise
       FROM product_prices
      WHERE product_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
    [productId],
  );

  if (current.rows[0]?.amount_paise === amountPaise) {
    return;
  }

  await query(`INSERT INTO product_prices (product_id, amount_paise) VALUES ($1, $2)`, [
    productId,
    amountPaise,
  ]);
}

export async function setStockLevel(productId: string, quantity: number): Promise<void> {
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new TypeError('stock quantity must be a non-negative integer');
  }
  await query(
    `INSERT INTO stock_levels (product_id, quantity, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (product_id) DO UPDATE
       SET quantity = EXCLUDED.quantity,
           updated_at = now()`,
    [productId, quantity],
  );
}

export async function archiveProduct(productId: string, note = 'Archived by admin'): Promise<void> {
  await query(
    `INSERT INTO product_status_events (product_id, status, note)
     VALUES ($1, 'archived', $2)`,
    [productId, note],
  );
}

export async function restoreProduct(productId: string, note = 'Restored by admin'): Promise<void> {
  await query(
    `INSERT INTO product_status_events (product_id, status, note)
     VALUES ($1, 'active', $2)`,
    [productId, note],
  );
}

/**
 * Write the durable content for a product and, when supplied, its image set,
 * current price and stock. Price changes append to the ledger; product
 * content is updated in place.
 */
export async function saveProductContent(input: ProductContentInput): Promise<Product> {
  if (!input.slug.trim() || !input.name.trim()) {
    throw new TypeError('product slug and name are required');
  }
  if (
    input.pricePaise !== undefined &&
    (!Number.isSafeInteger(input.pricePaise) || input.pricePaise < 0)
  ) {
    throw new TypeError('price must be a non-negative integer number of paise');
  }

  const productId = await withTransaction(async (client) => {
    const category = await client.query<{ id: string }>(
      'SELECT id FROM categories WHERE slug = $1',
      [input.categorySlug],
    );
    const categoryId = category.rows[0]?.id;
    if (!categoryId) {
      throw new Error(`Unknown category slug: ${input.categorySlug}`);
    }

    let id = input.id;
    if (id) {
      const updated = await client.query(
        `UPDATE products
            SET slug = $2, name = $3, description = $4, category_id = $5, updated_at = now()
          WHERE id = $1
          RETURNING id`,
        [id, input.slug, input.name, input.description ?? '', categoryId],
      );
      if (updated.rowCount === 0) {
        throw new Error(`Unknown product id: ${input.id}`);
      }
    } else {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO products (slug, name, description, category_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (slug) DO UPDATE
           SET name = EXCLUDED.name,
               description = EXCLUDED.description,
               category_id = EXCLUDED.category_id,
               updated_at = now()
         RETURNING id`,
        [input.slug, input.name, input.description ?? '', categoryId],
      );
      id = inserted.rows[0].id;
    }

    if (input.images) {
      await client.query('DELETE FROM product_images WHERE product_id = $1', [id]);
      for (const [position, image] of input.images.entries()) {
        await client.query(
          `INSERT INTO product_images (product_id, url, alt, position)
           VALUES ($1, $2, $3, $4)`,
          [id, image.url, image.alt ?? '', position],
        );
      }
    }

    if (input.pricePaise !== undefined) {
      const current = await client.query<{ amount_paise: number }>(
        `SELECT amount_paise
           FROM product_prices
          WHERE product_id = $1
          ORDER BY created_at DESC, id DESC
          LIMIT 1`,
        [id],
      );
      if (current.rows[0]?.amount_paise !== input.pricePaise) {
        await client.query(
          `INSERT INTO product_prices (product_id, amount_paise) VALUES ($1, $2)`,
          [id, input.pricePaise],
        );
      }
    }

    if (input.stockQuantity !== undefined) {
      if (!Number.isSafeInteger(input.stockQuantity) || input.stockQuantity < 0) {
        throw new TypeError('stock quantity must be a non-negative integer');
      }
      await client.query(
        `INSERT INTO stock_levels (product_id, quantity, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (product_id) DO UPDATE
           SET quantity = EXCLUDED.quantity,
               updated_at = now()`,
        [id, input.stockQuantity],
      );
    }

    return id;
  });

  const product = await getProductById(productId);
  if (!product) {
    throw new Error(`Product ${productId} could not be read after saving`);
  }
  return product;
}

export const catalogueService = {
  listCategories,
  listProducts,
  getProductBySlug,
  getProductById,
  createCategory,
  saveProductContent,
  setProductImages,
  setProductPrice,
  setStockLevel,
  archiveProduct,
  restoreProduct,
};
