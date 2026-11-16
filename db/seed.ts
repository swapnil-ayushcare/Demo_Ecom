import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCategory, saveProductContent } from '../src/server/catalogue/service';
import { closeDatabases } from '../src/server/db';
import { loadEnv } from '../src/server/env';

interface SeedCategory {
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
}

interface SeedProduct {
  slug: string;
  name: string;
  description: string;
  categorySlug: string;
  pricePaise: number;
  stockQuantity: number;
  images: Array<{ url: string; alt: string }>;
}

interface SeedFile {
  categories: SeedCategory[];
  products: SeedProduct[];
}

async function main(): Promise<void> {
  loadEnv();
  const seed = JSON.parse(
    readFileSync(join(process.cwd(), 'db', 'seed-data.json'), 'utf8'),
  ) as SeedFile;

  for (const category of seed.categories) {
    await createCategory(category);
  }

  for (const product of seed.products) {
    await saveProductContent(product);
  }

  console.log(
    `seed complete: ${seed.categories.length} categories, ${seed.products.length} products`,
  );
}

main()
  .then(async () => {
    await closeDatabases();
  })
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    await closeDatabases();
    process.exit(1);
  });
