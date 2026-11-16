import { expect, test } from '@playwright/test';
import { closeDatabases, query } from '../src/server/db';
import { hashToken, verifyPassword } from '../src/server/passwords';
import {
  establishSession,
  getSessionUser,
  revokeSession,
} from '../src/server/session';
import { createFixture } from '../src/test/fixtures';

test.afterAll(async () => {
  await closeDatabases();
});

test.describe('foundation services', () => {
  test('fixture factory creates users, catalogue and order records', async () => {
    const fixture = createFixture();
    const admin = await fixture.admin();
    const customer = await fixture.user();
    const category = await fixture.category();
    const product = await fixture.product({
      categorySlug: category.slug,
      pricePaise: 49_900,
      stockQuantity: 7,
      images: [
        { url: '/products/notebook.svg', alt: 'Fixture front' },
        { url: '/products/bag.svg', alt: 'Fixture back' },
      ],
    });

    expect(admin.role).toBe('admin');
    expect(customer.role).toBe('customer');

    const order = await fixture.order({
      userId: customer.id,
      items: [{ productId: product.id, quantity: 2 }],
      deliveryChargePaise: 4_000,
      statuses: ['placed', 'packed'],
    });
    expect(order.subtotalPaise).toBe(99_800);
    expect(order.deliveryChargePaise).toBe(4_000);
    expect(order.totalPaise).toBe(103_800);

    const storedUser = await query<{ password_hash: string; role: string }>(
      'SELECT password_hash, role FROM users WHERE id = $1',
      [customer.id],
    );
    expect(storedUser.rows[0].password_hash).not.toBe(customer.password);
    expect(storedUser.rows[0].password_hash.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword(customer.password, storedUser.rows[0].password_hash)).toBe(true);

    const images = await query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM product_images WHERE product_id = $1',
      [product.id],
    );
    expect(images.rows[0].count).toBe(2);

    const stock = await query<{ quantity: number }>(
      'SELECT quantity FROM stock_levels WHERE product_id = $1',
      [product.id],
    );
    expect(stock.rows[0].quantity).toBe(7);

    const price = await query<{ amount_paise: number }>(
      `SELECT amount_paise FROM product_prices
        WHERE product_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT 1`,
      [product.id],
    );
    expect(price.rows[0].amount_paise).toBe(49_900);

    const orderItems = await query<{ quantity: number; line_total_paise: number }>(
      'SELECT quantity, line_total_paise FROM order_items WHERE order_id = $1',
      [order.id],
    );
    expect(orderItems.rows).toHaveLength(1);
    expect(orderItems.rows[0].quantity).toBe(2);
    expect(orderItems.rows[0].line_total_paise).toBe(99_800);

    const statuses = await query<{ status: string }>(
      'SELECT status FROM order_status_events WHERE order_id = $1 ORDER BY created_at ASC',
      [order.id],
    );
    expect(statuses.rows.map((row) => row.status)).toEqual(['placed', 'packed']);
  });

  test('establishSession stores only a token hash and revokes cleanly', async () => {
    const fixture = createFixture();
    const user = await fixture.user();
    const session = await establishSession(user.id);

    expect(session.cookie.options.httpOnly).toBe(true);
    expect(session.cookie.options.sameSite).toBe('lax');
    expect(session.cookie.name).toBe('demo_ecom_session');

    const stored = await query<{ token_hash: string }>(
      'SELECT token_hash FROM sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [user.id],
    );
    expect(stored.rows[0].token_hash).toBe(hashToken(session.token));
    expect(stored.rows[0].token_hash).not.toBe(session.token);

    await expect(getSessionUser(session.token)).resolves.toMatchObject({
      id: user.id,
      role: 'customer',
    });

    await revokeSession(session.token);
    await expect(getSessionUser(session.token)).resolves.toBeNull();
  });
});
