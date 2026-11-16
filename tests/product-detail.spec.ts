import { spawnSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';
import { Client } from 'pg';
import { formatINR } from '../src/lib/money';
import { closeDatabases } from '../src/server/db';
import { resetEnvCache } from '../src/server/env';
import { createFixture } from '../src/test/fixtures';
import { startServer, type RunningServer } from './helpers/server';

const SEEDED_PRODUCT = 'malabar-black-pepper';
const PRODUCT_DETAIL_DATABASE = 'demo_ecom_product_detail';

interface SeededProduct {
  name: string;
  description: string;
  categoryName: string;
  categorySlug: string;
  pricePaise: number;
  stockQuantity: number;
  status: string | null;
  images: Array<{ url: string; alt: string }>;
}

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

async function readSeededProduct(connectionString: string, slug: string): Promise<SeededProduct> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const product = await client.query<{
      name: string;
      description: string;
      category_name: string;
      category_slug: string;
      price_paise: number;
      stock_quantity: number;
      status: string | null;
    }>(
      `SELECT
         p.name,
         p.description,
         c.name AS category_name,
         c.slug AS category_slug,
         COALESCE((
           SELECT amount_paise
             FROM product_prices
            WHERE product_id = p.id
            ORDER BY created_at DESC, id DESC
            LIMIT 1
         ), 0) AS price_paise,
         COALESCE((SELECT quantity FROM stock_levels WHERE product_id = p.id), 0) AS stock_quantity,
         (
           SELECT status
             FROM product_status_events
            WHERE product_id = p.id
            ORDER BY created_at DESC, id DESC
            LIMIT 1
         ) AS status
       FROM products p
       JOIN categories c ON c.id = p.category_id
       WHERE p.slug = $1`,
      [slug],
    );
    const row = product.rows[0];
    if (!row) {
      throw new Error(`Seeded product ${slug} was not found in the catalogue`);
    }

    const images = await client.query<{ url: string; alt: string }>(
      `SELECT pi.url, pi.alt
         FROM product_images pi
         JOIN products p ON p.id = pi.product_id
        WHERE p.slug = $1
        ORDER BY pi.position, pi.id`,
      [slug],
    );

    return {
      name: row.name,
      description: row.description,
      categoryName: row.category_name,
      categorySlug: row.category_slug,
      pricePaise: row.price_paise,
      stockQuantity: row.stock_quantity,
      status: row.status,
      images: images.rows,
    };
  } finally {
    await client.end();
  }
}

function expectedStockLabel(product: SeededProduct): string {
  if (product.stockQuantity <= 0) {
    return 'Out of stock';
  }
  if (product.stockQuantity <= 5) {
    return `Only ${product.stockQuantity} left`;
  }
  return 'In stock';
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
}

test.describe.configure({ mode: 'serial' });

test.describe('product detail', () => {
  test('shows all three seeded images, one selected, and database details in INR', async ({
    page,
  }) => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required');
    }

    const product = await readSeededProduct(databaseUrl, SEEDED_PRODUCT);
    expect(product.images).toHaveLength(3);
    expect(product.status === null || product.status === 'active').toBe(true);

    await page.setViewportSize({ width: 1280, height: 900 });
    const response = await page.goto(`/products/${SEEDED_PRODUCT}`);
    expect(response?.status()).toBe(200);
    await waitForStyles(page);
    await page.evaluate(() => document.fonts.ready);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(product.name);
    await expect(page.getByText(product.description, { exact: true })).toBeVisible();

    const category = page.getByTestId('product-category');
    await expect(category).toHaveText(product.categoryName);
    await expect(category).toHaveAttribute('href', `/category/${product.categorySlug}`);

    await expect(page.getByText(formatINR(product.pricePaise), { exact: true }).first()).toBeVisible();
    await expect(page.getByTestId('buy-panel')).toContainText('INR');
    await expect(page.getByTestId('product-stock')).toContainText(expectedStockLabel(product));

    const gallery = page.getByTestId('product-gallery');
    const renderedSources = await gallery
      .locator('img')
      .evaluateAll((images) => images.map((image) => image.getAttribute('src')));
    for (const image of product.images) {
      expect(renderedSources).toContain(image.url);
    }

    const selected = gallery.locator('[data-selected="true"]');
    await expect(selected).toHaveCount(1);
    await expect(gallery.locator('[aria-pressed="true"]')).toHaveCount(1);
    await expect(page.getByTestId('product-main-image')).toHaveAttribute(
      'src',
      product.images[0].url,
    );
    await expect(selected.locator('img')).toHaveAttribute('src', product.images[0].url);

    await gallery.locator('[data-selected="false"]').first().click();
    await expect(page.getByTestId('product-main-image')).toHaveAttribute(
      'src',
      product.images[1].url,
    );
    await expect(gallery.locator('[data-selected="true"]')).toHaveCount(1);

    const addButton = page.getByRole('button', { name: `Add ${product.name} to cart` });
    await expect(addButton).toBeEnabled();
    await expect(page.getByRole('spinbutton', { name: 'Quantity' })).toHaveValue('1');
    await page.getByRole('button', { name: 'Increase quantity' }).click();
    await expect(page.getByRole('spinbutton', { name: 'Quantity' })).toHaveValue('2');
    await page.getByRole('button', { name: 'Decrease quantity' }).click();
    await expect(page.getByRole('spinbutton', { name: 'Quantity' })).toHaveValue('1');

    await addButton.click();
    await expect(page.getByText('Added to your cart.')).toBeVisible();
    await expect(page.getByTestId('cart-count')).toHaveText('1');
  });

  test('product detail holds its composition at 375 and 1440', async ({ page }) => {
    for (const [width, height] of [
      [375, 844],
      [1440, 900],
    ] as const) {
      await page.setViewportSize({ width, height });
      const response = await page.goto(`/products/${SEEDED_PRODUCT}`);
      expect(response?.status()).toBe(200);
      await waitForStyles(page);
      await page.evaluate(() => document.fonts.ready);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);

      if (width === 1440) {
        const mainWidth = await page.evaluate(() => {
          const main = document.querySelector('main');
          return main ? main.getBoundingClientRect().width / window.innerWidth : 0;
        });
        expect(mainWidth).toBeGreaterThan(0.7);
      }

      await expect(page).toHaveScreenshot(`product-detail-${width}.png`, {
        fullPage: true,
        animations: 'disabled',
        maxDiffPixelRatio: 0.02,
      });
    }
  });
});

test.describe('product detail not found and phone composition', () => {
  let server: RunningServer;
  let originalDatabase: string | undefined;

  test.beforeAll(async () => {
    const base = process.env.DATABASE_URL;
    if (!base) {
      throw new Error('DATABASE_URL is required');
    }
    originalDatabase = base;
    const databaseUrl = await prepareDatabase(base, PRODUCT_DETAIL_DATABASE);
    server = await startServer(3110, { DATABASE_URL: databaseUrl });
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

  test('returns not found for a missing or archived slug and stacks gallery above the buy panel on a phone', async ({
    page,
  }) => {
    const missing = await page.goto(`${server.baseURL}/products/there-is-no-such-product-in-the-shop`);
    expect(missing?.status()).toBe(404);
    await expect(page.getByText('We could not find that page.')).toBeVisible();

    const fixture = createFixture();
    const archived = await fixture.product({
      name: 'Archived Product Detail Fixture',
      images: [
        { url: '/products/pepper.svg', alt: 'Archived product front' },
        { url: '/products/pepper-detail.svg', alt: 'Archived product detail' },
        { url: '/products/pepper-label.svg', alt: 'Archived product label' },
      ],
      stockQuantity: 4,
      archived: true,
    });

    const archivedResponse = await page.goto(`${server.baseURL}/products/${archived.slug}`);
    expect(archivedResponse?.status()).toBe(404);
    await expect(page.getByText('We could not find that page.')).toBeVisible();

    const soldOut = await fixture.product({
      name: 'Sold Out Product Detail Fixture',
      stockQuantity: 0,
    });
    const soldOutResponse = await page.goto(`${server.baseURL}/products/${soldOut.slug}`);
    expect(soldOutResponse?.status()).toBe(200);
    await expect(page.getByTestId('product-stock')).toContainText('Out of stock');
    await expect(
      page.getByRole('button', { name: `${soldOut.name} is out of stock` }),
    ).toBeDisabled();

    await page.setViewportSize({ width: 375, height: 844 });
    const detailResponse = await page.goto(`${server.baseURL}/products/${SEEDED_PRODUCT}`);
    expect(detailResponse?.status()).toBe(200);
    await waitForStyles(page);
    await page.evaluate(() => document.fonts.ready);

    const layout = await page.evaluate(() => {
      const gallery = document.querySelector('[data-testid="product-gallery"]');
      const buyPanel = document.querySelector('[data-testid="buy-panel"]');
      if (!gallery || !buyPanel) {
        return null;
      }
      const galleryRect = gallery.getBoundingClientRect();
      const buyRect = buyPanel.getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        galleryTop: galleryRect.top,
        galleryBottom: galleryRect.bottom,
        galleryWidth: galleryRect.width,
        buyTop: buyRect.top,
        buyBottom: buyRect.bottom,
        buyWidth: buyRect.width,
        galleryAboveBuy: galleryRect.top < buyRect.top,
        stacked: buyRect.top >= galleryRect.bottom - 1,
      };
    });

    expect(layout).not.toBeNull();
    expect(layout!.overflow).toBeLessThanOrEqual(1);
    expect(layout!.galleryAboveBuy).toBe(true);
    expect(layout!.stacked).toBe(true);
    expect(layout!.galleryWidth).toBeLessThanOrEqual(375);
    expect(layout!.buyWidth).toBeLessThanOrEqual(375);

    const tooSmall = await page.evaluate(() => {
      const scope = document.querySelector('[data-testid="buy-panel"], [data-testid="product-gallery"]');
      if (!scope) {
        return [{ tag: 'none', text: 'no scope', width: 0, height: 0 }];
      }
      return [...scope.querySelectorAll('button, input')]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return (
            style.visibility !== 'hidden' &&
            style.display !== 'none' &&
            rect.width > 0 &&
            rect.height > 0
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
  });
});
