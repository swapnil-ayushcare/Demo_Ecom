import { spawnSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';
import { Client } from 'pg';
import { closeDatabases } from '../src/server/db';
import { resetEnvCache } from '../src/server/env';
import { createFixture } from '../src/test/fixtures';
import { startServer, type RunningServer } from './helpers/server';

const CATEGORY_DATABASE = 'demo_ecom_category_products';

const SEEDED_CATEGORY = {
  slug: 'pantry',
  name: 'Pantry & Spices',
  products: [
    { slug: 'assam-ctc-tea', name: 'Assam CTC Tea' },
    { slug: 'kashmiri-chilli-powder', name: 'Kashmiri Chilli Powder' },
    { slug: 'malabar-black-pepper', name: 'Malabar Black Pepper' },
  ],
};

const OTHER_CATEGORY_PRODUCT = 'Steel Tumbler Set';

function withDatabaseName(connectionString: string, name: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${name}`;
  return url.toString();
}

async function prepareDatabase(baseUrl: string, name: string): Promise<string> {
  const maintenance = new Client({ connectionString: withDatabaseName(baseUrl, 'postgres') });
  await maintenance.connect();
  try {
    await maintenance.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await maintenance.query(`CREATE DATABASE ${name}`);
  } finally {
    await maintenance.end();
  }

  const databaseUrl = withDatabaseName(baseUrl, name);
  for (const script of ['migrate', 'seed']) {
    const result = spawnSync('npm', ['run', script], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    });
    if (result.status !== 0) {
      throw new Error(`npm run ${script} failed for ${databaseUrl}`);
    }
  }
  return databaseUrl;
}

async function waitForStyles(page: Page): Promise<void> {
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
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((image) =>
        image.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              image.addEventListener('load', () => resolve(), { once: true });
              image.addEventListener('error', () => resolve(), { once: true });
            }),
      ),
    );
  });
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

test.describe.configure({ mode: 'serial' });

test.describe('category product listing', () => {
  let server: RunningServer;
  let originalDatabase: string | undefined;

  test.beforeAll(async () => {
    const base = process.env.DATABASE_URL;
    if (!base) {
      throw new Error('DATABASE_URL is required');
    }
    originalDatabase = base;
    const databaseUrl = await prepareDatabase(base, CATEGORY_DATABASE);
    server = await startServer(3108, { DATABASE_URL: databaseUrl });
    process.env.DATABASE_URL = databaseUrl;
    resetEnvCache();
  });

  test.afterAll(async () => {
    await closeDatabases();
    if (originalDatabase) {
      process.env.DATABASE_URL = originalDatabase;
      resetEnvCache();
    }
    await server?.stop();
  });

  test('lists only the selected aisle with image, name, INR price and product link', async ({
    page,
  }) => {
    const fixture = createFixture();
    const archived = await fixture.product({
      name: 'Zzz Archived Pantry Product',
      slug: `zzz-archived-pantry-${Date.now()}`,
      categorySlug: SEEDED_CATEGORY.slug,
      archived: true,
    });

    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: width === 375 ? 844 : 900 });
      const response = await page.goto(server.baseURL + `/category/${SEEDED_CATEGORY.slug}`);
      expect(response?.status()).toBe(200);
      await waitForStyles(page);

      await expect(
        page.getByRole('heading', { level: 1, name: SEEDED_CATEGORY.name }),
      ).toBeVisible();
      await expect(page.locator('main article')).toHaveCount(SEEDED_CATEGORY.products.length);

      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

      await expect(page).toHaveScreenshot(`category-products-${width}.png`, {
        fullPage: true,
        animations: 'disabled',
        maxDiffPixelRatio: 0.02,
      });
    }

    const cards = page.locator('main article');
    await expect(cards).toHaveCount(SEEDED_CATEGORY.products.length);

    const imageCount = await cards.locator('img').count();
    expect(imageCount).toBe(SEEDED_CATEGORY.products.length);
    const brokenImages = await cards.locator('img').evaluateAll((images) =>
      images.filter((image) => !(image instanceof HTMLImageElement) || !image.complete || image.naturalWidth === 0).length,
    );
    expect(brokenImages).toBe(0);

    const categoryLabels: string[] = [];
    for (let index = 0; index < SEEDED_CATEGORY.products.length; index += 1) {
      categoryLabels.push(
        ((await cards.nth(index).locator('p').first().textContent()) ?? '').trim(),
      );
    }
    expect(categoryLabels).toEqual(
      SEEDED_CATEGORY.products.map(() => SEEDED_CATEGORY.name),
    );

    const names = await cards.locator('h3').allTextContents();
    expect(names.map((name) => name.trim()).sort()).toEqual(
      SEEDED_CATEGORY.products.map((product) => product.name).sort(),
    );

    const prices = await cards.locator('span[aria-label]').allTextContents();
    expect(prices).toHaveLength(SEEDED_CATEGORY.products.length);
    for (const price of prices) {
      expect(price).toContain('₹');
      expect(price).toContain('INR');
    }

    const links = await cards
      .locator('a[href^="/products/"]')
      .evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute('href')));
    expect(new Set(links)).toEqual(
      new Set(SEEDED_CATEGORY.products.map((product) => `/products/${product.slug}`)),
    );

    const html = await page.content();
    expect(html).not.toContain(OTHER_CATEGORY_PRODUCT);
    expect(html).not.toContain(archived.name);
  });

  test('an empty aisle shows its empty state with no broken grid or sideways scroll', async ({
    page,
  }) => {
    const fixture = createFixture();
    const empty = await fixture.category({
      name: 'Aaa Empty Test Aisle',
      description: 'A shelf the shopkeeper has not filled yet.',
    });

    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: width === 375 ? 844 : 900 });
      const response = await page.goto(server.baseURL + `/category/${empty.slug}`);
      expect(response?.status()).toBe(200);
      await waitForStyles(page);

      await expect(page.getByRole('heading', { level: 1, name: empty.name })).toBeVisible();
      await expect(page.getByText('Nothing in this aisle yet.', { exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: 'See every aisle' })).toBeVisible();
      await expect(page.locator('main article')).toHaveCount(0);
      await expect(page.locator('main [role="list"]')).toHaveCount(0);

      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    }

    await page.setViewportSize({ width: 375, height: 844 });
    await page.goto(server.baseURL + `/category/${empty.slug}`);
    await waitForStyles(page);
    await expect(page).toHaveScreenshot('category-empty-375.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });

  test('an unknown aisle slug returns the not-found page', async ({ page }) => {
    const response = await page.goto(server.baseURL + '/category/no-such-aisle-here');
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole('heading', { name: 'We could not find that page.' }),
    ).toBeVisible();
  });
});
