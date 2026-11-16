import { expect, test, type Page } from '@playwright/test';
import { startServer, type RunningServer } from './helpers/server';

let server: RunningServer;

async function waitForStyles(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const button = document.querySelector('[data-testid="cart-line"] button');
      return (
        document.styleSheets.length > 0 &&
        button !== null &&
        getComputedStyle(button).minHeight !== '0px'
      );
    },
    undefined,
    { timeout: 20_000 },
  );
}

test.describe.configure({ mode: 'serial' });

test.describe('cart page composition', () => {
  test.beforeAll(async () => {
    const visualDatabase = process.env.VISUAL_DATABASE_URL ?? process.env.DATABASE_URL;
    if (!visualDatabase) {
      throw new Error('A visual test database URL is required');
    }
    server = await startServer(3104, { DATABASE_URL: visualDatabase });
  });

  test.afterAll(async () => {
    await server?.stop();
  });

  test('cart reads like a receipt at phone and desktop widths', async ({ page, request }) => {
    const catalogue = await request.get(server.baseURL + '/api/catalogue');
    expect(catalogue.status()).toBe(200);
    const body = (await catalogue.json()) as {
      products: Array<{ id: string; name: string; pricePaise: number }>;
    };
    const pepper = body.products.find((product) => product.name === 'Malabar Black Pepper');
    expect(pepper).toBeDefined();

    const added = await page.request.post(server.baseURL + '/api/cart/items', {
      data: { productId: pepper!.id, quantity: 2 },
    });
    expect(added.status()).toBe(200);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(server.baseURL + '/cart');
    await waitForStyles(page);
    await page.evaluate(() => document.fonts.ready);

    await expect(page.getByRole('heading', { level: 1, name: 'Your cart' })).toBeVisible();
    const line = page.getByTestId('cart-line').filter({ hasText: 'Malabar Black Pepper' });
    await expect(line.getByTestId('cart-line-quantity')).toHaveText('2');
    await expect(page.getByTestId('cart-subtotal')).toContainText('₹571');

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
    for (const control of phone.controls) {
      expect(control.width).toBeGreaterThanOrEqual(44);
      expect(control.height).toBeGreaterThanOrEqual(44);
    }

    await expect(page).toHaveScreenshot('cart-phone.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(server.baseURL + '/cart');
    await waitForStyles(page);
    await page.evaluate(() => document.fonts.ready);

    const desktop = await page.evaluate(() => {
      const main = document.querySelector('main');
      const line = document.querySelector('[data-testid="cart-line"]');
      const bill = document.querySelector('[aria-labelledby="cart-summary-title"]');
      if (!main || !line || !bill) {
        return null;
      }
      const mainRect = main.getBoundingClientRect();
      const lineRect = line.getBoundingClientRect();
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

    await expect(page).toHaveScreenshot('cart-desktop.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });
});
