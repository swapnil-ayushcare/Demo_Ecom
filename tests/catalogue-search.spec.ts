import { spawnSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';
import { Client } from 'pg';
import { closeDatabases } from '../src/server/db';
import { resetEnvCache } from '../src/server/env';
import { createFixture, type FixtureProduct } from '../src/test/fixtures';
import { startServer, type RunningServer } from './helpers/server';

const SEARCH_DATABASE = 'demo_ecom_catalogue_search';
const SEARCH_PORT = 3107;
const FILTERED_PATH = '/search?q=cotton&category=shirts&min=500&max=1500&inStock=1';

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
      const field = document.querySelector('main input[type="search"]');
      return document.styleSheets.length > 0 && field !== null;
    },
    undefined,
    { timeout: 20_000 },
  );
}

async function resultNames(page: Page): Promise<string[]> {
  const names = await page.locator('main h3 a[href^="/products/"]').allTextContents();
  return names.map((name) => name.trim()).sort();
}

async function searchPage(page: Page, baseURL: string, path: string) {
  const response = await page.goto(baseURL + path);
  await waitForStyles(page);
  await page.evaluate(() => document.fonts.ready);
  return response;
}

test.describe.configure({ mode: 'serial' });

test.describe('catalogue search and filters', () => {
  let server: RunningServer;
  let originalDatabase: string | undefined;
  let cottonShirt: FixtureProduct;
  let cottonKurta: FixtureProduct;
  let cottonScarf: FixtureProduct;
  let handloom: FixtureProduct;
  let heavyCoat: FixtureProduct;
  let linenShirt: FixtureProduct;

  test.beforeAll(async () => {
    const base = process.env.DATABASE_URL;
    if (!base) {
      throw new Error('DATABASE_URL is required');
    }
    originalDatabase = base;
    const databaseUrl = await prepareDatabase(base, SEARCH_DATABASE);
    server = await startServer(SEARCH_PORT, { DATABASE_URL: databaseUrl });
    process.env.DATABASE_URL = databaseUrl;
    resetEnvCache();

    const fixture = createFixture();
    await fixture.category({ slug: 'shirts', name: 'Shirts', sortOrder: 5 });
    await fixture.category({ slug: 'trousers', name: 'Trousers', sortOrder: 6 });

    cottonShirt = await fixture.product({
      slug: 'cotton-shirt',
      name: 'Cotton Shirt',
      description: 'A plain woven cotton shirt with a soft collar.',
      categorySlug: 'shirts',
      pricePaise: 80_000,
      stockQuantity: 4,
    });
    cottonKurta = await fixture.product({
      slug: 'cotton-kurta',
      name: 'Cotton Kurta',
      description: 'A light cotton kurta for warm afternoons.',
      categorySlug: 'shirts',
      pricePaise: 1_20_000,
      stockQuantity: 0,
    });
    cottonScarf = await fixture.product({
      slug: 'cotton-scarf',
      name: 'Cotton Scarf',
      description: 'A handwoven cotton scarf in indigo.',
      categorySlug: 'trousers',
      pricePaise: 70_000,
      stockQuantity: 5,
    });
    handloom = await fixture.product({
      slug: 'handloom-overshirt',
      name: 'Handloom Overshirt',
      description: 'Woven cotton on a handloom, with a relaxed fall.',
      categorySlug: 'shirts',
      pricePaise: 1_00_000,
      stockQuantity: 3,
    });
    heavyCoat = await fixture.product({
      slug: 'heavy-cotton-coat',
      name: 'Heavy Cotton Coat',
      description: 'A thick cotton coat for the cold months.',
      categorySlug: 'shirts',
      pricePaise: 2_00_000,
      stockQuantity: 5,
    });
    linenShirt = await fixture.product({
      slug: 'linen-shirt',
      name: 'Linen Shirt',
      description: 'A breathable linen shirt, cut plainly.',
      categorySlug: 'shirts',
      pricePaise: 90_000,
      stockQuantity: 5,
    });
    await fixture.product({
      slug: 'archived-cotton-shirt',
      name: 'Archived Cotton Shirt',
      description: 'A cotton shirt withdrawn from the shelf.',
      categorySlug: 'shirts',
      pricePaise: 90_000,
      stockQuantity: 5,
      archived: true,
    });
  });

  test.afterAll(async () => {
    await closeDatabases();
    if (originalDatabase) {
      process.env.DATABASE_URL = originalDatabase;
      resetEnvCache();
    }
    await server?.stop();
  });

  test('phrase, category, price and stock filters combine, stay visible and clear without losing q', async ({
    page,
  }) => {
    const response = await searchPage(page, server.baseURL, FILTERED_PATH);
    expect(response?.status()).toBe(200);

    await expect(page.getByRole('heading', { level: 1 })).toContainText('cotton');
    await expect(page.getByRole('status')).toHaveText('2 products found');

    const names = await resultNames(page);
    expect(names).toEqual([cottonShirt.name, handloom.name].sort());
    await expect(page.getByRole('link', { name: cottonShirt.name, exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: handloom.name, exact: true })).toBeVisible();
    for (const excluded of [cottonKurta, cottonScarf, heavyCoat, linenShirt]) {
      await expect(page.getByRole('link', { name: excluded.name, exact: true })).toHaveCount(0);
    }

    const activeFilters = page.getByRole('region', { name: 'Active filters' });
    await expect(activeFilters).toBeVisible();
    await expect(activeFilters).toContainText('Category · Shirts');
    await expect(activeFilters).toContainText('From ₹500');
    await expect(activeFilters).toContainText('Up to ₹1,500');
    await expect(activeFilters).toContainText('In stock only');
    await expect(activeFilters.getByRole('link', { name: 'Clear all' })).toBeVisible();

    await expect(
      page.getByRole('searchbox', { name: 'Search products by name or description' }),
    ).toHaveValue('cotton');

    await page.getByRole('link', { name: 'Clear filters', exact: true }).click();
    await page.waitForURL(
      (url) =>
        url.pathname === '/search' &&
        url.searchParams.get('q') === 'cotton' &&
        !url.searchParams.has('category'),
    );

    const cleared = new URL(page.url());
    expect(cleared.searchParams.get('q')).toBe('cotton');
    expect(cleared.searchParams.get('category')).toBeNull();
    expect(cleared.searchParams.get('min')).toBeNull();
    expect(cleared.searchParams.get('max')).toBeNull();
    expect(cleared.searchParams.get('inStock')).toBeNull();

    await expect(
      page.getByRole('searchbox', { name: 'Search products by name or description' }),
    ).toHaveValue('cotton');
    await expect(page.getByRole('status')).toHaveText(/\d+ products found/);
    await expect(page.getByRole('link', { name: cottonKurta.name, exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: cottonScarf.name, exact: true })).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Active filters' }).getByText('In stock only'),
    ).toHaveCount(0);
  });

  test('the URL reproduces the result set, an empty phrase explains itself and SQL metacharacters stay safe', async ({
    page,
    request,
  }) => {
    await searchPage(page, server.baseURL, FILTERED_PATH);
    const before = await resultNames(page);
    expect(before).toEqual([cottonShirt.name, handloom.name].sort());

    const reloaded = await searchPage(page, server.baseURL, FILTERED_PATH);
    expect(reloaded?.status()).toBe(200);
    const after = await resultNames(page);
    expect(after).toEqual(before);

    const nonsensePath = `/search?q=${encodeURIComponent('zzzz-no-such-thing')}`;
    const nonsense = await request.get(server.baseURL + nonsensePath);
    expect(nonsense.status()).toBe(200);
    await searchPage(page, server.baseURL, nonsensePath);
    await expect(page.getByText(/No products found for “zzzz-no-such-thing”\./)).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('No products found');

    const attack = "'; DROP TABLE products; --";
    const attackPath = `/search?q=${encodeURIComponent(attack)}`;
    const attacked = await request.get(server.baseURL + attackPath);
    expect(attacked.status()).toBe(200);
    const attackedHtml = await attacked.text();
    expect(attackedHtml).not.toMatch(
      /invalid input syntax|syntax error at or near|relation "products" does not exist/i,
    );

    await searchPage(page, server.baseURL, attackPath);
    await expect(page.getByText(/No products found for/)).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('No products found');

    const survived = await request.get(server.baseURL + '/search?q=cotton');
    expect(survived.status()).toBe(200);
    const survivedHtml = await survived.text();
    expect(survivedHtml).toContain(cottonShirt.name);
  });

  test('search recomposes at phone and desktop widths and keeps its controls reachable', async ({
    page,
  }) => {
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: width === 375 ? 844 : 900 });
      const response = await searchPage(page, server.baseURL, FILTERED_PATH);
      expect(response?.status()).toBe(200);

      const metrics = await page.evaluate(() => {
        const main = document.querySelector('main');
        const rail = document.querySelector('aside[aria-label="Search filters"]');
        const results = document.querySelector('section[aria-labelledby="results-title"]');
        const mainRect = main?.getBoundingClientRect();
        const railRect = rail?.getBoundingClientRect();
        const resultsRect = results?.getBoundingClientRect();
        const controls = [...document.querySelectorAll(
          'main button, main select, main input[type="search"], main input[type="number"]',
        )].filter((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return style.display !== 'none' && rect.width > 0 && rect.height > 0;
        });

        return {
          overflow: document.documentElement.scrollWidth - window.innerWidth,
          mainWidth: mainRect?.width ?? 0,
          railLeft: railRect?.left ?? 0,
          resultsLeft: resultsRect?.left ?? 0,
          viewport: window.innerWidth,
          controls: controls.map((element) => {
            const rect = element.getBoundingClientRect();
            return {
              tag: element.tagName,
              type: element.getAttribute('type'),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            };
          }),
        };
      });

      expect(metrics.overflow).toBeLessThanOrEqual(1);
      await expect(page.getByRole('searchbox', { name: 'Search the shop' })).toBeVisible();
      await expect(
        page.getByRole('searchbox', { name: 'Search products by name or description' }),
      ).toBeVisible();
      await expect(page.getByRole('status')).toBeVisible();
      await expect(page.getByRole('region', { name: 'Active filters' })).toBeVisible();

      if (width === 1280) {
        expect(metrics.mainWidth / metrics.viewport).toBeGreaterThan(0.7);
        expect(metrics.railLeft).toBeLessThan(metrics.resultsLeft);
      }

      if (width === 375) {
        const small = metrics.controls.filter(
          (control) => control.width < 44 || control.height < 44,
        );
        expect(small).toEqual([]);
        await expect(page).toHaveScreenshot('catalogue-search-375.png', {
          fullPage: true,
          animations: 'disabled',
          maxDiffPixelRatio: 0.02,
        });
      }

      if (width === 1280) {
        await expect(page).toHaveScreenshot('catalogue-search-1280.png', {
          fullPage: true,
          animations: 'disabled',
          maxDiffPixelRatio: 0.02,
        });
      }
    }
  });
});
