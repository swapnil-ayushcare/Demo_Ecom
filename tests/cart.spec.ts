import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { createFixture, type FixtureProduct } from '../src/test/fixtures';

const PASSWORD = 'CartCounter123!';

async function signUp(page: Page, name: string): Promise<{ email: string }> {
  const email = `cart-${randomUUID()}@example.test`;

  await page.goto('/sign-up');
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);

  await Promise.all([
    page.waitForURL((url) => url.pathname === '/'),
    page.getByRole('button', { name: 'Create account' }).click(),
  ]);

  return { email };
}

async function cartProduct(name: string): Promise<FixtureProduct> {
  const fixture = createFixture();
  return fixture.product({
    name,
    pricePaise: 49_900,
    stockQuantity: 10,
    images: [{ url: '/products/tea.svg', alt: 'A cart test product on the shelf' }],
  });
}

async function addOnce(page: Page, product: FixtureProduct, expectedCount: number): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: `Add ${product.name} to cart` }).click();
  await expect(page.getByTestId('cart-count')).toHaveText(String(expectedCount));
}

test.describe('shopping cart', () => {
  test('adding, changing quantity and removing a line updates the INR cart', async ({ page }) => {
    const product = await cartProduct(`Cart Kettle ${randomUUID().slice(0, 6)}`);
    await signUp(page, 'Cart Counter');

    await addOnce(page, product, 1);
    await page.getByRole('button', { name: `Add ${product.name} to cart` }).click();
    await expect(page.getByTestId('cart-count')).toHaveText('2');

    await page.goto('/cart');
    await expect(page.getByRole('heading', { level: 1, name: 'Your cart' })).toBeVisible();

    const line = page.getByTestId('cart-line').filter({ hasText: product.name });
    await expect(line).toBeVisible();
    await expect(line.getByTestId('cart-line-quantity')).toHaveText('2');
    await expect(line.getByTestId('cart-line-total')).toContainText('₹998');
    await expect(page.getByTestId('cart-subtotal')).toContainText('₹998');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/cart');
    const phone = await page.evaluate(() => {
      const controls = [...document.querySelectorAll('[data-testid="cart-line"] button')].map(
        (element) => {
          const rect = element.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        },
      );
      return {
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        controls,
      };
    });
    expect(phone.overflow).toBeLessThanOrEqual(1);
    expect(phone.controls.length).toBeGreaterThanOrEqual(3);
    for (const control of phone.controls) {
      expect(control.width).toBeGreaterThanOrEqual(44);
      expect(control.height).toBeGreaterThanOrEqual(44);
    }

    const phoneLine = page.getByTestId('cart-line').filter({ hasText: product.name });
    await phoneLine.getByRole('button', { name: `Decrease quantity of ${product.name}` }).click();
    await expect(phoneLine.getByTestId('cart-line-quantity')).toHaveText('1');
    await expect(phoneLine.getByTestId('cart-line-total')).toContainText('₹499');
    await expect(page.getByTestId('cart-subtotal')).toContainText('₹499');

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/cart');
    const desktop = await page.evaluate(() => {
      const main = document.querySelector('main');
      const summary = document.querySelector('[data-testid="cart-line"]');
      const bill = document.querySelector('[aria-labelledby="cart-summary-title"]');
      if (!main || !summary || !bill) {
        return null;
      }
      const mainRect = main.getBoundingClientRect();
      const lineRect = summary.getBoundingClientRect();
      const billRect = bill.getBoundingClientRect();
      return {
        width: mainRect.width,
        viewport: window.innerWidth,
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        billIsBesideLines: billRect.left >= lineRect.right - 4,
      };
    });
    expect(desktop).not.toBeNull();
    expect(desktop!.overflow).toBeLessThanOrEqual(1);
    expect(desktop!.width / desktop!.viewport).toBeGreaterThan(0.7);
    expect(desktop!.billIsBesideLines).toBe(true);

    const desktopLine = page.getByTestId('cart-line').filter({ hasText: product.name });
    await desktopLine
      .getByRole('button', { name: `Remove ${product.name} from cart` })
      .click();
    await expect(page.getByTestId('cart-empty')).toBeVisible();
    await expect(page.getByTestId('cart-line')).toHaveCount(0);
    await expect(page.getByTestId('cart-subtotal')).toHaveCount(0);
  });

  test('a signed-in cart survives refresh and a new context, stays private, and ignores a browser price', async ({
    page,
    browser,
  }) => {
    const product = await cartProduct(`Cart Flask ${randomUUID().slice(0, 6)}`);
    await signUp(page, 'Persist One');
    await addOnce(page, product, 1);

    await page.goto('/cart');
    const line = page.getByTestId('cart-line').filter({ hasText: product.name });
    await expect(line.getByTestId('cart-line-quantity')).toHaveText('1');
    await expect(page.getByTestId('cart-subtotal')).toContainText('₹499');

    await page.reload();
    await expect(line).toBeVisible();
    await expect(line.getByTestId('cart-line-quantity')).toHaveText('1');
    await expect(page.getByTestId('cart-subtotal')).toContainText('₹499');

    const storageState = await page.context().storageState();
    const sameCustomerContext = await browser.newContext({ storageState });
    const sameCustomerPage = await sameCustomerContext.newPage();
    await sameCustomerPage.goto('/cart');
    await expect(
      sameCustomerPage.getByTestId('cart-line').filter({ hasText: product.name }),
    ).toBeVisible();
    await expect(
      sameCustomerPage
        .getByTestId('cart-line')
        .filter({ hasText: product.name })
        .getByTestId('cart-line-quantity'),
    ).toHaveText('1');
    await sameCustomerContext.close();

    const otherCustomerContext = await browser.newContext();
    const otherCustomerPage = await otherCustomerContext.newPage();
    await signUp(otherCustomerPage, 'Persist Two');
    await otherCustomerPage.goto('/cart');
    await expect(otherCustomerPage.getByTestId('cart-empty')).toBeVisible();
    await expect(otherCustomerPage.getByText(product.name)).toHaveCount(0);
    await otherCustomerContext.close();

    const tampered = await page.request.post('/api/cart/items', {
      data: {
        productId: product.id,
        quantity: 1,
        pricePaise: 1,
        unitPricePaise: 1,
        lineTotalPaise: 1,
      },
    });
    expect(tampered.status()).toBe(200);
    const tamperedBody = (await tampered.json()) as {
      cart: {
        lines: Array<{ productId: string; unitPricePaise: number; lineTotalPaise: number }>;
        subtotalPaise: number;
      };
    };
    const tamperedLine = tamperedBody.cart.lines.find(
      (candidate) => candidate.productId === product.id,
    );
    expect(tamperedLine).toBeDefined();
    expect(tamperedLine?.unitPricePaise).toBe(49_900);
    expect(tamperedLine?.lineTotalPaise).toBe(99_800);
    expect(tamperedBody.cart.subtotalPaise).toBe(99_800);

    await page.goto('/cart');
    await expect(
      page.getByTestId('cart-line').filter({ hasText: product.name }).getByTestId('cart-line-total'),
    ).toContainText('₹998');
    await expect(page.getByTestId('cart-subtotal')).toContainText('₹998');
  });

  test('a guest cart is an opaque cookie and is not shared with another browser', async ({
    page,
    browser,
  }) => {
    const product = await cartProduct(`Cart Soap ${randomUUID().slice(0, 6)}`);

    await addOnce(page, product, 1);
    await page.goto('/cart');
    await expect(
      page.getByTestId('cart-line').filter({ hasText: product.name }),
    ).toBeVisible();

    const cartCookie = (await page.context().cookies()).find(
      (cookie) => cookie.name === 'demo_ecom_cart',
    );
    expect(cartCookie).toBeDefined();
    expect(cartCookie?.httpOnly).toBe(true);
    expect((cartCookie?.value ?? '').length).toBeGreaterThan(20);
    expect(await page.evaluate(() => document.cookie)).not.toContain('demo_ecom_cart');

    const otherGuestContext = await browser.newContext();
    const otherGuestPage = await otherGuestContext.newPage();
    await otherGuestPage.goto('/cart');
    await expect(otherGuestPage.getByTestId('cart-empty')).toBeVisible();
    await expect(otherGuestPage.getByText(product.name)).toHaveCount(0);
    await otherGuestContext.close();
  });
});
