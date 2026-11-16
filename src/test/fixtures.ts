import { randomBytes, randomUUID } from 'node:crypto';
import {
  archiveProduct,
  createCategory,
  getProductBySlug,
  saveProductContent,
} from '../server/catalogue/service';
import { query, withTransaction } from '../server/db';
import { hashPassword } from '../server/passwords';

const DEFAULT_PASSWORD = 'FixturePass123!';

export interface CategoryInput {
  slug: string;
  name: string;
  description?: string;
  sortOrder?: number;
}

export interface FixtureProductInput {
  slug: string;
  name: string;
  description: string;
  categorySlug: string;
  images: Array<{ url: string; alt: string }>;
  pricePaise: number;
  stockQuantity: number;
  archived: boolean;
}

function suffix(): string {
  return randomBytes(5).toString('hex');
}

export interface FixtureUser {
  id: string;
  name: string;
  email: string;
  role: 'customer' | 'admin';
  password: string;
}

export interface FixtureCategory {
  id: string;
  slug: string;
  name: string;
}

export interface FixtureProduct {
  id: string;
  slug: string;
  name: string;
  pricePaise: number;
  stockQuantity: number;
  categorySlug: string;
}

export interface FixtureOrderItemInput {
  productId?: string;
  productSlug?: string;
  quantity?: number;
  unitPricePaise?: number;
}

export interface FixtureOrderInput {
  userId?: string;
  items?: FixtureOrderItemInput[];
  deliveryChargePaise?: number;
  paymentStatus?: 'pending' | 'paid' | 'failed' | 'refunded';
  statuses?: Array<'placed' | 'packed' | 'shipped' | 'delivered' | 'cancelled'>;
  address?: {
    name?: string;
    phone?: string;
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    pincode?: string;
  };
}

export interface FixtureOrder {
  id: string;
  orderNumber: string;
  userId: string;
  subtotalPaise: number;
  deliveryChargePaise: number;
  totalPaise: number;
  items: Array<{
    productId: string | null;
    productName: string;
    unitPricePaise: number;
    quantity: number;
    lineTotalPaise: number;
  }>;
}

export interface FixtureFactory {
  user(input?: Partial<{ name: string; email: string; password: string; role: 'customer' | 'admin' }>): Promise<FixtureUser>;
  admin(input?: Partial<{ name: string; email: string; password: string }>): Promise<FixtureUser>;
  category(input?: Partial<CategoryInput>): Promise<FixtureCategory>;
  product(input?: Partial<FixtureProductInput>): Promise<FixtureProduct>;
  order(input?: FixtureOrderInput): Promise<FixtureOrder>;
}

export function createFixture(): FixtureFactory {
  const tag = suffix();

  async function user(
    input: Partial<{ name: string; email: string; password: string; role: 'customer' | 'admin' }> = {},
  ): Promise<FixtureUser> {
    const id = randomUUID();
    const email = input.email ?? `fixture-${tag}-${randomUUID().slice(0, 8)}@example.test`;
    const name = input.name ?? `Fixture ${email.split('@')[0]}`;
    const role = input.role ?? 'customer';
    const password = input.password ?? DEFAULT_PASSWORD;
    const passwordHash = await hashPassword(password);

    await query(
      `INSERT INTO users (id, name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, name, email, passwordHash, role],
    );

    return { id, name, email, role, password };
  }

  async function category(input: Partial<CategoryInput> = {}): Promise<FixtureCategory> {
    const slug = input.slug ?? `fixture-category-${tag}-${randomUUID().slice(0, 8)}`;
    const name = input.name ?? `Fixture Category ${slug.slice(-8)}`;
    const created = await createCategory({
      slug,
      name,
      description: input.description ?? '',
      sortOrder: input.sortOrder ?? 500,
    });
    return { id: created.id, slug: created.slug, name: created.name };
  }

  async function product(input: Partial<FixtureProductInput> = {}): Promise<FixtureProduct> {
    const categorySlug =
      input.categorySlug ?? (await category()).slug;
    const slug = input.slug ?? `fixture-product-${tag}-${randomUUID().slice(0, 8)}`;
    const pricePaise = input.pricePaise ?? 49_900;
    const stockQuantity = input.stockQuantity ?? 10;
    const saved = await saveProductContent({
      slug,
      name: input.name ?? `Fixture Product ${slug.slice(-8)}`,
      description: input.description ?? 'A product created by the foundation fixture factory.',
      categorySlug,
      images: input.images ?? [{ url: '/products/notebook.svg', alt: 'Fixture product image' }],
      pricePaise,
      stockQuantity,
    });

    if (input.archived) {
      await archiveProduct(saved.id, 'Fixture archived product');
    }

    return {
      id: saved.id,
      slug: saved.slug,
      name: saved.name,
      pricePaise,
      stockQuantity,
      categorySlug,
    };
  }

  async function order(input: FixtureOrderInput = {}): Promise<FixtureOrder> {
    const customer = input.userId ? { id: input.userId } : await user();
    const userId = customer.id;
    const requestedItems = input.items ?? [];

    if (requestedItems.length === 0) {
      const created = await product();
      requestedItems.push({ productId: created.id, quantity: 1 });
    }

    return withTransaction(async (client) => {
      const items: FixtureOrder['items'] = [];

      for (const requested of requestedItems) {
        let productRow:
          | { id: string; name: string; amount_paise: number }
          | undefined;

        if (requested.productId) {
          const result = await client.query<{ id: string; name: string; amount_paise: number }>(
            `SELECT p.id, p.name, COALESCE(pr.amount_paise, 0) AS amount_paise
               FROM products p
               LEFT JOIN LATERAL (
                 SELECT amount_paise FROM product_prices
                  WHERE product_id = p.id
                  ORDER BY created_at DESC, id DESC
                  LIMIT 1
               ) pr ON true
              WHERE p.id = $1`,
            [requested.productId],
          );
          productRow = result.rows[0];
        } else if (requested.productSlug) {
          const result = await client.query<{ id: string; name: string; amount_paise: number }>(
            `SELECT p.id, p.name, COALESCE(pr.amount_paise, 0) AS amount_paise
               FROM products p
               LEFT JOIN LATERAL (
                 SELECT amount_paise FROM product_prices
                  WHERE product_id = p.id
                  ORDER BY created_at DESC, id DESC
                  LIMIT 1
               ) pr ON true
              WHERE p.slug = $1`,
            [requested.productSlug],
          );
          productRow = result.rows[0];
        }

        if (!productRow) {
          throw new Error('Fixture order needs an existing product');
        }

        const quantity = requested.quantity ?? 1;
        const unitPricePaise = requested.unitPricePaise ?? productRow.amount_paise;
        const lineTotalPaise = unitPricePaise * quantity;
        items.push({
          productId: productRow.id,
          productName: productRow.name,
          unitPricePaise,
          quantity,
          lineTotalPaise,
        });
      }

      const subtotalPaise = items.reduce((total, item) => total + item.lineTotalPaise, 0);
      const deliveryChargePaise = input.deliveryChargePaise ?? 0;
      const totalPaise = subtotalPaise + deliveryChargePaise;
      const orderNumber = `FX-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`;
      const paymentStatus = input.paymentStatus ?? 'paid';

      const orderResult = await client.query<{ id: string }>(
        `INSERT INTO orders
           (order_number, user_id, subtotal_paise, delivery_charge_paise, total_paise, payment_status)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [orderNumber, userId, subtotalPaise, deliveryChargePaise, totalPaise, paymentStatus],
      );
      const orderId = orderResult.rows[0].id;

      const address = input.address ?? {};
      await client.query(
        `INSERT INTO order_addresses
           (order_id, name, phone, line1, line2, city, state, pincode)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          orderId,
          address.name ?? 'Fixture Customer',
          address.phone ?? '9000000000',
          address.line1 ?? '1 Test Lane',
          address.line2 ?? '',
          address.city ?? 'Pune',
          address.state ?? 'Maharashtra',
          address.pincode ?? '411001',
        ],
      );

      for (const item of items) {
        await client.query(
          `INSERT INTO order_items
             (order_id, product_id, product_name, unit_price_paise, quantity, line_total_paise)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            orderId,
            item.productId,
            item.productName,
            item.unitPricePaise,
            item.quantity,
            item.lineTotalPaise,
          ],
        );
      }

      if (paymentStatus === 'paid') {
        await client.query(
          `INSERT INTO payments
             (order_id, razorpay_order_id, razorpay_payment_id, amount_paise, status, signature_verified)
           VALUES ($1, $2, $3, $4, 'captured', true)`,
          [
            orderId,
            `order_fixture_${randomUUID().slice(0, 12)}`,
            `pay_fixture_${randomUUID().slice(0, 12)}`,
            totalPaise,
          ],
        );
      }

      const statuses = input.statuses ?? ['placed'];
      for (const status of statuses) {
        await client.query(
          `INSERT INTO order_status_events (order_id, status, actor_user_id)
           VALUES ($1, $2, $3)`,
          [orderId, status, status === 'placed' ? null : userId],
        );
      }

      return {
        id: orderId,
        orderNumber,
        userId,
        subtotalPaise,
        deliveryChargePaise,
        totalPaise,
        items,
      };
    });
  }

  return {
    user,
    admin: (input = {}) => user({ ...input, role: 'admin' }),
    category,
    product,
    order,
  };
}

export { DEFAULT_PASSWORD, getProductBySlug };
