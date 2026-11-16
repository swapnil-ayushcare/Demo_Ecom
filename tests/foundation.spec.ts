import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { Client } from 'pg';
import { formatINR } from '../src/lib/money';

interface DbCategory {
  slug: string;
  name: string;
  description: string;
  sort_order: number;
}

interface DbProduct {
  slug: string;
  name: string;
  description: string;
  category_slug: string;
  price_paise: number;
  stock_quantity: number;
}

let db: Client;

test.beforeAll(async () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required by the foundation tests');
  }
  db = new Client({ connectionString });
  await db.connect();
});

test.afterAll(async () => {
  await db.end();
});

test.describe('foundation package', () => {
  test('clean install, migrate, seed and start succeed', async ({ request }) => {
    const root = process.cwd();
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      engines?: { node?: string };
    };

    expect(pkg.engines?.node).toBe('20.x');
    expect(Number(process.versions.node.split('.')[0])).toBe(20);
    expect(existsSync(join(root, 'package-lock.json'))).toBe(true);
    expect(existsSync(join(root, '.env.example'))).toBe(true);

    const migrations = await db.query<{ filename: string }>(
      'SELECT filename FROM schema_migrations ORDER BY filename',
    );
    expect(migrations.rows.map((row) => row.filename)).toContain('0001_foundation.sql');

    const counts = await db.query<{ categories: number; products: number }>(
      `SELECT
         (SELECT COUNT(*)::int FROM categories) AS categories,
         (SELECT COUNT(*)::int FROM products) AS products`,
    );
    expect(counts.rows[0].categories).toBeGreaterThan(0);
    expect(counts.rows[0].products).toBeGreaterThan(0);

    const health = await request.get('/api/health');
    expect(health.status()).toBe(200);
    expect(await health.json()).toMatchObject({ status: 'ok', database: 'up' });

    const catalogue = await request.get('/api/catalogue');
    expect(catalogue.status()).toBe(200);
  });

  test('seeded catalogue is returned from the database', async ({ request }) => {
    const response = await request.get('/api/catalogue');
    expect(response.status()).toBe(200);
    const body = (await response.json()) as {
      currency: string;
      categories: Array<{ slug: string; name: string; description: string; productCount: number }>;
      products: Array<{
        slug: string;
        name: string;
        description: string;
        category: { slug: string };
        pricePaise: number;
        priceDisplay: string;
        stockQuantity: number;
        images: Array<{ url: string; alt: string }>;
      }>;
    };

    expect(body.currency).toBe('INR');

    const dbCategories = await db.query<DbCategory>(
      'SELECT slug, name, description, sort_order FROM categories ORDER BY sort_order, name',
    );
    expect(body.categories.map((category) => category.slug)).toEqual(
      dbCategories.rows.map((category) => category.slug),
    );
    for (const category of body.categories) {
      const row = dbCategories.rows.find((candidate) => candidate.slug === category.slug);
      expect(row).toBeDefined();
      expect(category.name).toBe(row?.name);
      expect(category.description).toBe(row?.description);
    }

    const dbProducts = await db.query<DbProduct>(
      `SELECT
         p.slug,
         p.name,
         p.description,
         c.slug AS category_slug,
         COALESCE(pr.amount_paise, 0)::int AS price_paise,
         COALESCE(sl.quantity, 0) AS stock_quantity
       FROM products p
       JOIN categories c ON c.id = p.category_id
       LEFT JOIN LATERAL (
         SELECT amount_paise FROM product_prices
          WHERE product_id = p.id
          ORDER BY created_at DESC, id DESC
          LIMIT 1
       ) pr ON true
       LEFT JOIN stock_levels sl ON sl.product_id = p.id
       ORDER BY p.name`,
    );

    expect(body.products).toHaveLength(dbProducts.rows.length);
    for (const product of body.products) {
      const row = dbProducts.rows.find((candidate) => candidate.slug === product.slug);
      expect(row).toBeDefined();
      expect(product.name).toBe(row?.name);
      expect(product.description).toBe(row?.description);
      expect(product.category.slug).toBe(row?.category_slug);
      expect(product.pricePaise).toBe(row?.price_paise);
      expect(product.priceDisplay).toBe(formatINR(row?.price_paise ?? 0));
      expect(product.stockQuantity).toBe(row?.stock_quantity);
      expect(product.images.length).toBeGreaterThan(0);
    }

    const pepper = body.products.find((product) => product.slug === 'malabar-black-pepper');
    expect(pepper).toBeDefined();
    expect(pepper?.pricePaise).toBe(28_550);
    expect(pepper?.priceDisplay).toBe('₹285.50');
    expect(pepper?.images).toHaveLength(3);
  });

  test('missing variable stops startup and is named', async () => {
    const env: NodeJS.ProcessEnv = { ...process.env, PORT: '3199', DEMO_ECOM_SKIP_DOTENV: '1' };
    delete env.DATABASE_URL;

    const output = await new Promise<{ code: number | null; text: string }>((resolve) => {
      const child = spawn('npm', ['start'], {
        cwd: process.cwd(),
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let text = '';
      child.stdout.on('data', (chunk: Buffer) => {
        text += chunk.toString();
      });
      child.stderr.on('data', (chunk: Buffer) => {
        text += chunk.toString();
      });
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        resolve({ code: -1, text: `${text}\nTimed out waiting for startup to fail` });
      }, 60_000);
      child.on('exit', (code) => {
        clearTimeout(timer);
        resolve({ code, text });
      });
    });

    expect(output.code).not.toBe(0);
    expect(output.text).toContain('Missing required environment');
    expect(output.text).toContain('DATABASE_URL');
  });
});
