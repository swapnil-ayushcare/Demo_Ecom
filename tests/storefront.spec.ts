import { expect, test } from '@playwright/test';
import { startServer, type RunningServer } from './helpers/server';

let server: RunningServer;

async function waitForStyles(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const link = document.querySelector('header nav a');
      return (
        document.styleSheets.length > 0 &&
        link !== null &&
        getComputedStyle(link).minHeight !== '0px'
      );
    },
    undefined,
    { timeout: 20_000 },
  );
}

test.describe.configure({ mode: 'serial' });

test.describe('storefront foundation', () => {
  test.beforeAll(async () => {
    const visualDatabase = process.env.VISUAL_DATABASE_URL ?? process.env.DATABASE_URL;
    if (!visualDatabase) {
      throw new Error('A visual test database URL is required');
    }
    server = await startServer(3103, { DATABASE_URL: visualDatabase });
  });

  test.afterAll(async () => {
    await server?.stop();
  });

  test('phone layout keeps navigation reachable without sideways scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(server.baseURL + '/');
    await waitForStyles(page);
    await page.evaluate(() => document.fonts.ready);

    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Everyday things, honestly priced.',
    );
    await expect(page.getByRole('searchbox', { name: 'Search the shop' })).toBeVisible();
    await expect(page.getByRole('link', { name: /cart/i })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Malabar Black Pepper', exact: true })).toBeVisible();
    await expect(page.getByText('₹285.50', { exact: true }).first()).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    const tooSmall = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('header a, header button, header input')];
      return nodes
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return (
            style.visibility !== 'hidden' &&
            style.display !== 'none' &&
            rect.width > 0 &&
            rect.height > 0 &&
            rect.left >= 0 &&
            rect.right <= window.innerWidth
          );
        })
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width < 44 || rect.height < 44;
        })
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName,
            text: (element.textContent ?? '').trim().slice(0, 40),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          };
        });
    });
    expect(tooSmall).toEqual([]);

    await expect(page).toHaveScreenshot('home-phone.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });

  test('desktop layout uses the width it is given', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(server.baseURL + '/');
    await waitForStyles(page);
    await page.evaluate(() => document.fonts.ready);

    const layout = await page.evaluate(() => {
      const main = document.querySelector('main');
      if (!main) {
        return null;
      }
      const rect = main.getBoundingClientRect();
      return {
        width: rect.width,
        left: rect.left,
        viewport: window.innerWidth,
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    });

    expect(layout).not.toBeNull();
    expect(layout!.overflow).toBeLessThanOrEqual(1);
    expect(layout!.width).toBeGreaterThanOrEqual(1000);
    expect(layout!.width / layout!.viewport).toBeGreaterThan(0.7);
    expect(layout!.left).toBeLessThanOrEqual(160);

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Malabar Black Pepper', exact: true })).toBeVisible();

    await expect(page).toHaveScreenshot('home-desktop.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });
});
