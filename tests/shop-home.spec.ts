import { spawnSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';
import { Client } from 'pg';
import { closeDatabases } from '../src/server/db';
import { resetEnvCache } from '../src/server/env';
import { createFixture } from '../src/test/fixtures';
import { startServer, type RunningServer } from './helpers/server';

const SHOP_HOME_DATABASE = 'demo_ecom_shop_home';

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
}

interface CardMetrics {
  cardWidth: number;
  cardHeight: number;
  cardLeft: number;
  cardRight: number;
  imageVisible: boolean;
  nameText: string;
  nameFontSize: number;
  nameClipped: boolean;
  priceText: string;
  priceFontSize: number;
  priceClipped: boolean;
  priceContrast: number;
  nameContrast: number;
}

interface HomeMetrics {
  overflow: number;
  railScrollable: boolean;
  railLeft: number;
  railRight: number;
  mainWidth: number;
  viewportWidth: number;
  card: CardMetrics | null;
}

async function homeMetrics(page: Page): Promise<HomeMetrics> {
  return page.evaluate(() => {
    const rail = document.querySelector('nav[aria-label="Product categories"]');
    const main = document.querySelector('main');
    const card = document.querySelector('main article');
    const railStyle = rail ? getComputedStyle(rail) : null;
    const railRect = rail?.getBoundingClientRect();
    const mainRect = main?.getBoundingClientRect();

    if (!card) {
      return {
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        railScrollable: false,
        railLeft: railRect?.left ?? 0,
        railRight: railRect?.right ?? 0,
        mainWidth: mainRect?.width ?? 0,
        viewportWidth: window.innerWidth,
        card: null,
      };
    }

    const cardRect = card.getBoundingClientRect();
    const image = card.querySelector('img');
    const imageRect = image?.getBoundingClientRect();
    const name = card.querySelector('h3 a');
    const price = card.querySelector('span[aria-label]') as HTMLElement | null;
    const cardStyle = getComputedStyle(card);
    const nameStyle = name ? getComputedStyle(name) : null;
    const priceStyle = price ? getComputedStyle(price) : null;

    const luminance = (rgb: string): number => {
      const channels = rgb
        .match(/\d+(?:\.\d+)?/g)
        ?.slice(0, 3)
        .map((part) => {
          const channel = Number(part) / 255;
          return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        });
      if (!channels || channels.length !== 3) {
        return 0;
      }
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    };

    const contrast = (foreground: string, background: string): number => {
      const first = luminance(foreground);
      const second = luminance(background);
      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    };

    return {
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      railScrollable: Boolean(
        rail &&
          railStyle &&
          (rail.scrollWidth > rail.clientWidth + 1 ||
            railStyle.overflowX === 'auto' ||
            railStyle.overflowX === 'scroll'),
      ),
      railLeft: railRect?.left ?? 0,
      railRight: railRect?.right ?? 0,
      mainWidth: mainRect?.width ?? 0,
      viewportWidth: window.innerWidth,
      card: {
        cardWidth: cardRect.width,
        cardHeight: cardRect.height,
        cardLeft: cardRect.left,
        cardRight: cardRect.right,
        imageVisible: Boolean(
          image &&
            imageRect &&
            imageRect.width > 0 &&
            imageRect.height > 0 &&
            image.complete &&
            image.naturalWidth > 0,
        ),
        nameText: (name?.textContent ?? '').trim(),
        nameFontSize: nameStyle ? parseFloat(nameStyle.fontSize) : 0,
        nameClipped: name ? name.scrollWidth > name.clientWidth + 1 : true,
        priceText: (price?.textContent ?? '').trim(),
        priceFontSize: priceStyle ? parseFloat(priceStyle.fontSize) : 0,
        priceClipped: price ? price.scrollWidth > price.clientWidth + 1 : true,
        priceContrast:
          price && priceStyle
            ? contrast(priceStyle.color, priceStyle.backgroundColor)
            : 0,
        nameContrast:
          name && nameStyle
            ? contrast(nameStyle.color, cardStyle.backgroundColor)
            : 0,
      },
    };
  });
}

test.describe.configure({ mode: 'serial' });

test.describe('shop home at phone and desktop widths', () => {
  let server: RunningServer;

  test.beforeAll(async () => {
    const visualDatabase = process.env.VISUAL_DATABASE_URL ?? process.env.DATABASE_URL;
    if (!visualDatabase) {
      throw new Error('A visual test database URL is required');
    }
    server = await startServer(3105, { DATABASE_URL: visualDatabase });
  });

  test.afterAll(async () => {
    await server?.stop();
  });

  test('home front door holds at 375 and 1280', async ({ page }) => {
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: width === 375 ? 844 : 900 });
      await page.goto(server.baseURL + '/');
      await waitForStyles(page);
      await page.evaluate(() => document.fonts.ready);

      await expect(page.getByRole('link', { name: 'Demo_Ecom home' })).toBeVisible();
      await expect(page.getByRole('searchbox', { name: 'Search the shop' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Cart' })).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Product categories' })).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      const metrics = await homeMetrics(page);

      expect(metrics.overflow).toBeLessThanOrEqual(1);
      expect(metrics.railScrollable).toBe(true);
      expect(metrics.railLeft).toBeGreaterThanOrEqual(-1);
      expect(metrics.railRight).toBeLessThanOrEqual(metrics.viewportWidth + 1);
      expect(metrics.card).not.toBeNull();

      const card = metrics.card!;
      expect(card.imageVisible).toBe(true);
      expect(card.nameText.length).toBeGreaterThan(0);
      expect(card.nameFontSize).toBeGreaterThanOrEqual(14);
      expect(card.nameClipped).toBe(false);
      expect(card.nameContrast).toBeGreaterThanOrEqual(4.5);
      expect(card.priceText).toMatch(/₹/);
      expect(card.priceText).toContain('INR');
      expect(card.priceFontSize).toBeGreaterThanOrEqual(14);
      expect(card.priceClipped).toBe(false);
      expect(card.priceContrast).toBeGreaterThanOrEqual(4.5);
      expect(card.cardWidth).toBeGreaterThanOrEqual(width === 375 ? 140 : 220);
      expect(card.cardHeight).toBeGreaterThanOrEqual(220);
      expect(card.cardLeft).toBeGreaterThanOrEqual(-1);
      expect(card.cardRight).toBeLessThanOrEqual(width + 1);

      if (width === 1280) {
        expect(metrics.mainWidth / metrics.viewportWidth).toBeGreaterThan(0.7);
      }

      if (width === 375) {
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
      }

      await expect(page).toHaveScreenshot(`shop-home-${width}.png`, {
        fullPage: true,
        animations: 'disabled',
        maxDiffPixelRatio: 0.02,
      });
    }
  });
});

test.describe('shop home catalogue reads', () => {
  let server: RunningServer;
  let originalDatabase: string | undefined;

  test.beforeAll(async () => {
    const base = process.env.DATABASE_URL;
    if (!base) {
      throw new Error('DATABASE_URL is required');
    }
    originalDatabase = base;
    const databaseUrl = await prepareDatabase(base, SHOP_HOME_DATABASE);
    server = await startServer(3106, { DATABASE_URL: databaseUrl });
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

  test('categories and active products come from PostgreSQL while archived products stay hidden', async ({
    request,
  }) => {
    const fixture = createFixture();
    const aisle = await fixture.category({
      name: 'Aaa Shop Home Aisle',
      description: 'A category created through the product contract.',
    });
    const active = await fixture.product({
      name: 'Aaa Shop Home Active Product',
      categorySlug: aisle.slug,
      pricePaise: 12_345,
      stockQuantity: 3,
    });
    const archived = await fixture.product({
      name: 'Zzz Shop Home Archived Product',
      categorySlug: aisle.slug,
      pricePaise: 99_900,
      stockQuantity: 4,
      archived: true,
    });
    const archivedOnly = await fixture.product({
      name: 'Zzz Shop Home Archived Only',
      pricePaise: 4_900,
      stockQuantity: 1,
      archived: true,
    });

    const response = await request.get(server.baseURL + '/');
    expect(response.status()).toBe(200);
    const html = await response.text();

    expect(html).toContain(aisle.name);
    expect(html).toContain(active.name);
    expect(html).not.toContain(archived.name);
    expect(html).not.toContain(archivedOnly.name);
    expect(html).toContain('/category/' + aisle.slug);
    expect(html).toContain(`/products/${active.slug}`);
  });
});
