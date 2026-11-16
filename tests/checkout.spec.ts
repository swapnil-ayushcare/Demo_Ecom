import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { Client } from 'pg';
import { createFixture, type FixtureProduct } from '../src/test/fixtures';
import { startServer, type RunningServer } from './helpers/server';

const PASSWORD = 'CheckoutCounter123!';
const SANDBOX_KEY_ID = 'rzp_test_checkout_suite';

let server: RunningServer;
let db: Client;

const ADDRESS = {
  name: 'Asha Rao',
  phone: '9876543210',
  line1: '12 Market Lane',
  line2: 'Near the old clock tower',
  city: 'Pune',
  state: 'Maharashtra',
  pincode: '411001',
};

const CARD_FIELD = /\b(card[_-]?number|cardnumber|cvv|cvc|expiry|exp_month|exp_year|security_code)\b/i;
const CARD_NUMBER_IN_TEXT = /(?<![\w-])\d{13,19}(?![\w-])/;

test.describe.configure({ mode: 'serial' });

async function waitForStyles(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const input = document.querySelector('form input');
      return (
        document.styleSheets.length > 0 &&
        input !== null &&
        getComputedStyle(input).minHeight !== '0px'
      );
    },
    undefined,
    { timeout: 20_000 },
  );
}

async function signUp(page: Page, name: string): Promise<{ email: string }> {
  const email = `checkout-${randomUUID()}@example.test`;

  await page.goto(`${server.baseURL}/sign-up`);
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);

  await Promise.all([
    page.waitForURL((url) => url.pathname === '/'),
    page.getByRole('button', { name: 'Create account' }).click(),
  ]);

  return { email };
}

async function addToCart(page: Page, product: FixtureProduct): Promise<void> {
  const response = await page.request.post(`${server.baseURL}/api/cart/items`, {
    data: { productId: product.id, quantity: 1 },
  });
  expect(response.status()).toBe(200);
}

async function checkoutProduct(pricePaise = 49_900): Promise<FixtureProduct> {
  return createFixture().product({
    name: `Checkout Kettle ${randomUUID().slice(0, 6)}`,
    pricePaise,
    stockQuantity: 10,
    images: [{ url: '/products/tea.svg', alt: 'A checkout test product on the shelf' }],
  });
}

async function fillAddress(page: Page, overrides: Partial<typeof ADDRESS> = {}): Promise<void> {
  const values = { ...ADDRESS, ...overrides };
  await page.getByLabel('Full name').fill(values.name);
  await page.getByLabel('Phone number').fill(values.phone);
  await page.getByLabel('Address line 1').fill(values.line1);
  await page.getByLabel('Address line 2').fill(values.line2);
  await page.getByLabel('City or town').fill(values.city);
  await page.getByLabel('State').fill(values.state);
  await page.getByLabel('PIN code').fill(values.pincode);
}

async function submitAddress(page: Page) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        candidate.url().endsWith('/api/checkout/session') &&
        candidate.request().method() === 'POST',
    ),
    page.getByRole('button', { name: 'Continue to payment' }).click(),
  ]);
  return response;
}

async function cartLines(page: Page): Promise<{ subtotalPaise: number; lineCount: number }> {
  const response = await page.request.get(`${server.baseURL}/api/cart`);
  expect(response.status()).toBe(200);
  const body = (await response.json()) as {
    cart: { subtotalPaise: number; lines: Array<{ id: string }> };
  };
  return { subtotalPaise: body.cart.subtotalPaise, lineCount: body.cart.lines.length };
}

function collectCardFields(raw: string, source: string): void {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return;
  }

  const visit = (value: unknown, key: string): void => {
    expect(key, `${source} sent a field named ${key}`).not.toMatch(CARD_FIELD);
    if (typeof value === 'string') {
      expect(value, `${source} sent a card-number-looking value`).not.toMatch(/^\d{13,19}$/);
      return;
    }
    if (typeof value === 'number' && Number.isInteger(value)) {
      expect(String(value), `${source} stored a card-number-looking number`).not.toMatch(
        /^\d{13,19}$/,
      );
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry) => visit(entry, key));
      return;
    }
    if (value && typeof value === 'object') {
      for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
        visit(childValue, childKey);
      }
    }
  };

  visit(data, '');
}

test.beforeAll(async () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required by the checkout tests');
  }
  db = new Client({ connectionString });
  await db.connect();

  server = await startServer(3109, {
    DATABASE_URL: connectionString,
    RAZORPAY_SANDBOX: '1',
    RAZORPAY_KEY_ID: SANDBOX_KEY_ID,
    RAZORPAY_KEY_SECRET: 'checkout-suite-secret-0000000000000000',
  });
});

test.afterAll(async () => {
  await server?.stop();
  await db?.end();
});

test.describe('Razorpay checkout', () => {
  test('a valid delivery address shows the server total and delivery charge before payment', async ({
    page,
  }) => {
    const product = await checkoutProduct();
    await signUp(page, 'Checkout Shopper');
    await addToCart(page, product);

    await page.goto(`${server.baseURL}/checkout`);
    await expect(page.getByRole('heading', { level: 1, name: 'Checkout' })).toBeVisible();
    await expect(page.getByTestId('checkout-subtotal')).toContainText('₹499');
    await expect(page.getByTestId('checkout-delivery')).toContainText('₹49');
    await expect(page.getByTestId('checkout-total')).toContainText('₹548');
    await expect(page.getByTestId('checkout-payment-step')).toHaveCount(0);

    await page.getByLabel('Address line 1').fill('');
    await page.getByLabel('PIN code').fill('12');
    await page.getByRole('button', { name: 'Continue to payment' }).click();
    await expect(page.getByText('Enter the house or building and street.')).toBeVisible();
    await expect(page.getByText('Enter a valid 6-digit PIN code.')).toBeVisible();
    await expect(page.getByTestId('checkout-payment-step')).toHaveCount(0);

    await fillAddress(page);
    const response = await submitAddress(page);
    expect(response.status()).toBe(201);
    const body = (await response.json()) as {
      checkoutSession: {
        id: string;
        razorpayOrderId: string;
        keyId: string;
        subtotalPaise: number;
        deliveryChargePaise: number;
        totalPaise: number;
        sandbox: boolean;
      };
    };
    expect(body.checkoutSession.razorpayOrderId).toMatch(/^order_sb_/);
    expect(body.checkoutSession.keyId).toBe(SANDBOX_KEY_ID);
    expect(body.checkoutSession.sandbox).toBe(true);
    expect(body.checkoutSession.subtotalPaise).toBe(49_900);
    expect(body.checkoutSession.deliveryChargePaise).toBe(4_900);
    expect(body.checkoutSession.totalPaise).toBe(54_800);

    await expect(page.getByTestId('checkout-payment-step')).toBeVisible();
    await expect(page.getByTestId('checkout-address-recap')).toContainText('Asha Rao');
    await expect(page.getByTestId('checkout-delivery')).toContainText('₹49');
    await expect(page.getByTestId('checkout-total')).toContainText('₹548');

    const currentCart = await cartLines(page);
    expect(currentCart.subtotalPaise).toBe(body.checkoutSession.subtotalPaise);
    expect(currentCart.subtotalPaise + body.checkoutSession.deliveryChargePaise).toBe(
      body.checkoutSession.totalPaise,
    );
  });

  test('a UPI test payment verifies the signature, creates the paid order and clears the cart', async ({
    page,
  }) => {
    const product = await checkoutProduct();
    const { email } = await signUp(page, 'Upi Buyer');
    await addToCart(page, product);

    await page.goto(`${server.baseURL}/checkout`);
    await fillAddress(page);
    const sessionResponse = await submitAddress(page);
    expect(sessionResponse.status()).toBe(201);
    const sessionBody = (await sessionResponse.json()) as {
      checkoutSession: { razorpayOrderId: string };
    };

    await Promise.all([
      page.waitForURL((url) => url.pathname.startsWith('/checkout/confirmation/')),
      page.getByRole('button', { name: 'Pay by UPI (test)' }).click(),
    ]);

    const orderNumber = ((await page.getByTestId('order-number').textContent()) ?? '').trim();
    expect(orderNumber).toMatch(/^DE-\d{8}-[A-F0-9]{8}$/);
    await expect(page.getByTestId('confirmation-total')).toContainText('₹548');
    await expect(page.getByTestId('confirmation-status')).toHaveText('Paid');
    await expect(page.getByTestId('confirmation-address')).toContainText('Asha Rao');
    await expect(page.getByTestId('confirmation-address')).toContainText('411001');

    const userRow = await db.query<{ id: string }>(
      'SELECT id FROM users WHERE lower(email) = lower($1)',
      [email],
    );
    expect(userRow.rowCount).toBe(1);
    const userId = userRow.rows[0].id;

    const orderResult = await db.query<{
      id: string;
      user_id: string;
      subtotal_paise: string;
      delivery_charge_paise: string;
      total_paise: string;
      payment_status: string;
    }>(
      `SELECT id, user_id, subtotal_paise, delivery_charge_paise, total_paise, payment_status
         FROM orders
        WHERE order_number = $1 AND user_id = $2`,
      [orderNumber, userId],
    );
    expect(orderResult.rowCount).toBe(1);
    const order = orderResult.rows[0];
    expect(Number(order.subtotal_paise)).toBe(49_900);
    expect(Number(order.delivery_charge_paise)).toBe(4_900);
    expect(Number(order.total_paise)).toBe(54_800);
    expect(order.payment_status).toBe('paid');

    const address = await db.query<{
      name: string;
      phone: string;
      line1: string;
      city: string;
      state: string;
      pincode: string;
    }>(
      `SELECT name, phone, line1, city, state, pincode
         FROM order_addresses
        WHERE order_id = $1`,
      [order.id],
    );
    expect(address.rows[0]).toMatchObject({
      name: ADDRESS.name,
      phone: ADDRESS.phone,
      line1: ADDRESS.line1,
      city: ADDRESS.city,
      state: ADDRESS.state,
      pincode: ADDRESS.pincode,
    });

    const items = await db.query<{
      product_name: string;
      unit_price_paise: string;
      quantity: number;
      line_total_paise: string;
    }>(
      `SELECT product_name, unit_price_paise, quantity, line_total_paise
         FROM order_items
        WHERE order_id = $1`,
      [order.id],
    );
    expect(items.rowCount).toBe(1);
    expect(items.rows[0].product_name).toBe(product.name);
    expect(Number(items.rows[0].unit_price_paise)).toBe(49_900);
    expect(items.rows[0].quantity).toBe(1);
    expect(Number(items.rows[0].line_total_paise)).toBe(49_900);

    const payment = await db.query<{
      razorpay_order_id: string;
      razorpay_payment_id: string;
      amount_paise: string;
      status: string;
      signature_verified: boolean;
    }>(
      `SELECT razorpay_order_id, razorpay_payment_id, amount_paise, status, signature_verified
         FROM payments
        WHERE order_id = $1`,
      [order.id],
    );
    expect(payment.rowCount).toBe(1);
    expect(payment.rows[0].razorpay_order_id).toBe(sessionBody.checkoutSession.razorpayOrderId);
    expect(payment.rows[0].razorpay_payment_id).toMatch(/^pay_sb_/);
    expect(Number(payment.rows[0].amount_paise)).toBe(54_800);
    expect(payment.rows[0].status).toBe('captured');
    expect(payment.rows[0].signature_verified).toBe(true);

    const holds = await db.query<{ quantity: number }>(
      'SELECT quantity FROM stock_holds WHERE order_id = $1',
      [order.id],
    );
    expect(holds.rowCount).toBe(1);
    expect(holds.rows[0].quantity).toBe(1);

    const events = await db.query<{ status: string }>(
      'SELECT status FROM order_status_events WHERE order_id = $1 ORDER BY created_at ASC',
      [order.id],
    );
    expect(events.rows.map((event) => event.status)).toContain('placed');

    const cleared = await cartLines(page);
    expect(cleared.lineCount).toBe(0);
    expect(cleared.subtotalPaise).toBe(0);
    await page.goto(`${server.baseURL}/cart`);
    await expect(page.getByTestId('cart-empty')).toBeVisible();
  });

  test('a cancelled payment and a bad signature create no order, leave the cart untouched and receive no card data', async ({
    page,
  }) => {
    const product = await checkoutProduct();
    const { email } = await signUp(page, 'Careful Buyer');
    await addToCart(page, product);

    const postedBodies: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST') {
        postedBodies.push(request.postData() ?? '');
      }
    });

    const userRow = await db.query<{ id: string }>(
      'SELECT id FROM users WHERE lower(email) = lower($1)',
      [email],
    );
    const userId = userRow.rows[0].id;

    const sessionResponse = await page.request.post(`${server.baseURL}/api/checkout/session`, {
      data: { address: ADDRESS },
    });
    expect(sessionResponse.status()).toBe(201);
    const sessionBody = (await sessionResponse.json()) as {
      checkoutSession: { id: string; razorpayOrderId: string };
    };

    const mismatch = await page.request.post(`${server.baseURL}/api/checkout/verify`, {
      data: {
        checkoutSessionId: sessionBody.checkoutSession.id,
        razorpay_order_id: sessionBody.checkoutSession.razorpayOrderId,
        razorpay_payment_id: `pay_sb_${'0'.repeat(20)}`,
        razorpay_signature: 'a'.repeat(64),
      },
    });
    expect(mismatch.status()).toBe(402);
    const mismatchBody = (await mismatch.json()) as { error: string };
    expect(mismatchBody.error).toBe('payment_verification_failed');

    const afterMismatch = await db.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM orders WHERE user_id = $1',
      [userId],
    );
    expect(afterMismatch.rows[0].count).toBe(0);
    expect((await cartLines(page)).subtotalPaise).toBe(49_900);

    await page.goto(`${server.baseURL}/checkout`);
    await fillAddress(page);
    const uiSession = await submitAddress(page);
    expect(uiSession.status()).toBe(201);
    await expect(page.getByTestId('checkout-payment-step')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel payment' }).click();
    await expect(
      page.getByText('Payment cancelled. Your cart is unchanged and no order was created.'),
    ).toBeVisible();

    const afterCancel = await db.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM orders WHERE user_id = $1',
      [userId],
    );
    expect(afterCancel.rows[0].count).toBe(0);
    expect((await cartLines(page)).subtotalPaise).toBe(49_900);

    for (const body of postedBodies) {
      collectCardFields(body, 'request');
    }

    const inputNames = await page.evaluate(() =>
      [...document.querySelectorAll('input, select, textarea')].map(
        (element) => element.getAttribute('name') ?? '',
      ),
    );
    expect(inputNames.length).toBeGreaterThan(0);
    for (const name of inputNames) {
      expect(name).not.toMatch(CARD_FIELD);
    }

    for (const table of [
      'orders',
      'payments',
      'order_addresses',
      'order_items',
      'checkout_sessions',
      'stock_holds',
    ]) {
      const rows = await db.query<{ payload: string }>(
        `SELECT to_jsonb(r)::text AS payload FROM ${table} r`,
      );
      for (const row of rows.rows) {
        collectCardFields(row.payload, table);
      }
    }

    const logs = server.logs();
    expect(logs).not.toMatch(CARD_FIELD);
    expect(logs).not.toMatch(CARD_NUMBER_IN_TEXT);
  });

  test('delivery is free at the ₹500 boundary and the server total agrees', async ({ page }) => {
    const product = await checkoutProduct(50_000);
    await signUp(page, 'Free Delivery Shopper');
    await addToCart(page, product);

    const sessionResponse = await page.request.post(`${server.baseURL}/api/checkout/session`, {
      data: { address: ADDRESS },
    });
    expect(sessionResponse.status()).toBe(201);
    const sessionBody = (await sessionResponse.json()) as {
      checkoutSession: { deliveryChargePaise: number; totalPaise: number };
    };
    expect(sessionBody.checkoutSession.deliveryChargePaise).toBe(0);
    expect(sessionBody.checkoutSession.totalPaise).toBe(50_000);

    await page.goto(`${server.baseURL}/checkout`);
    await expect(page.getByTestId('checkout-subtotal')).toContainText('₹500');
    await expect(page.getByTestId('checkout-delivery')).toHaveText('Free');
    await expect(page.getByTestId('checkout-total')).toContainText('₹500');
    await expect(page.getByTestId('checkout-payment-step')).toHaveCount(0);
  });

  test('signed-out checkout sends the shopper to sign in and back', async ({ page }) => {
    await page.goto(`${server.baseURL}/checkout`);
    await page.waitForURL(
      (url) => url.pathname === '/sign-in' && url.searchParams.get('next') === '/checkout',
    );
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fcheckout|\/sign-in\?next=\/checkout/);
  });

  test('checkout recomposes at phone, tablet and desktop widths', async ({ page }) => {
    const product = await createFixture().product({
      name: 'Checkout Visual Kettle',
      pricePaise: 49_900,
      stockQuantity: 10,
      images: [{ url: '/products/tea.svg', alt: 'A plain kettle on paper' }],
    });
    await signUp(page, 'Checkout Visual');
    await addToCart(page, product);

    async function measure() {
      return page.evaluate(() => {
        const addressPanel = document.querySelector('[aria-labelledby="checkout-address-title"]');
        const summary = document.querySelector('[aria-labelledby="checkout-summary-title"]');
        const main = document.querySelector('main');
        const controls = [...document.querySelectorAll('main input, main button')].map(
          (element) => {
            const rect = element.getBoundingClientRect();
            return { tag: element.tagName, width: rect.width, height: rect.height };
          },
        );
        if (!addressPanel || !summary || !main) {
          return null;
        }
        const addressRect = addressPanel.getBoundingClientRect();
        const summaryRect = summary.getBoundingClientRect();
        const mainRect = main.getBoundingClientRect();
        return {
          overflow: document.documentElement.scrollWidth - window.innerWidth,
          controls,
          addressTop: addressRect.top,
          addressBottom: addressRect.bottom,
          addressRight: addressRect.right,
          summaryTop: summaryRect.top,
          summaryLeft: summaryRect.left,
          mainWidth: mainRect.width,
          viewport: window.innerWidth,
          searchVisible: Boolean(document.querySelector('input[name="q"]')),
        };
      });
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${server.baseURL}/checkout`);
    await waitForStyles(page);
    await page.evaluate(() => document.fonts.ready);

    const phone = await measure();
    expect(phone).not.toBeNull();
    expect(phone!.overflow).toBeLessThanOrEqual(1);
    expect(phone!.searchVisible).toBe(true);
    expect(phone!.summaryTop).toBeGreaterThanOrEqual(phone!.addressBottom - 2);
    for (const control of phone!.controls) {
      expect(control.width, `${control.tag} width`).toBeGreaterThanOrEqual(44);
      expect(control.height, `${control.tag} height`).toBeGreaterThanOrEqual(44);
    }
    await expect(page.locator('main')).toHaveScreenshot('checkout-phone.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });

    await page.setViewportSize({ width: 768, height: 900 });
    await page.reload();
    await waitForStyles(page);
    const tablet = await measure();
    expect(tablet).not.toBeNull();
    expect(tablet!.overflow).toBeLessThanOrEqual(1);
    expect(tablet!.summaryTop).toBeGreaterThanOrEqual(tablet!.addressBottom - 2);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${server.baseURL}/checkout`);
    await waitForStyles(page);
    await page.evaluate(() => document.fonts.ready);
    const desktop = await measure();
    expect(desktop).not.toBeNull();
    expect(desktop!.overflow).toBeLessThanOrEqual(1);
    expect(desktop!.mainWidth / desktop!.viewport).toBeGreaterThan(0.7);
    expect(desktop!.summaryLeft).toBeGreaterThanOrEqual(desktop!.addressRight - 4);
    for (const control of desktop!.controls) {
      expect(control.height, `${control.tag} height`).toBeGreaterThanOrEqual(44);
    }
    await expect(page.locator('main')).toHaveScreenshot('checkout-desktop.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });
});
