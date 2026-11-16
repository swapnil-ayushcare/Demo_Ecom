import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { startServer, type RunningServer } from './helpers/server';

const ROOT = process.cwd();
const FEATURES_DIR = join(ROOT, 'src', 'features');
const PROBE_SLUG = 'probe-capability';
const PROBE_DIR = join(FEATURES_DIR, '__probe_capability');
const PORT = 3102;

const SHARED_ENTRY_FILES = [
  'src/app/layout.tsx',
  'src/app/(shop)/layout.tsx',
  'src/app/(shop)/page.tsx',
  'src/app/[...slug]/page.tsx',
  'src/app/api/features/route.ts',
  'src/components/ui/AppShell.tsx',
  'src/server/features/registry.ts',
];

let server: RunningServer | null = null;
let beforeHashes: Record<string, string> = {};

function hashSharedEntryFiles(): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const relativePath of SHARED_ENTRY_FILES) {
    const content = readFileSync(join(ROOT, relativePath));
    hashes[relativePath] = createHash('sha256').update(content).digest('hex');
  }
  return hashes;
}

test.describe.configure({ mode: 'serial' });

test.describe('feature registry discovery', () => {
  test.beforeAll(async () => {
    beforeHashes = hashSharedEntryFiles();
    rmSync(PROBE_DIR, { recursive: true, force: true });
    mkdirSync(PROBE_DIR, { recursive: true });
    writeFileSync(
      join(PROBE_DIR, 'feature.json'),
      JSON.stringify(
        {
          slug: PROBE_SLUG,
          title: 'Probe Capability',
          description: 'A throwaway capability created by the foundation discovery test.',
          routes: [{ path: '/probe-capability', title: 'Probe Capability' }],
          navigation: [
            {
              label: 'Probe Capability',
              href: '/probe-capability',
              area: 'shop',
              order: 5,
            },
          ],
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(PROBE_DIR, 'page.html'),
      '<h1>Probe capability is live</h1><p data-probe="yes">This page came from a directory dropped into src/features.</p>',
    );

    server = await startServer(PORT);
  });

  test.afterAll(async () => {
    await server?.stop();
    rmSync(PROBE_DIR, { recursive: true, force: true });
  });

  test('new feature directory is discovered', async () => {
    const response = await fetch(`${server!.baseURL}/api/features`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      features: Array<{
        slug: string;
        title: string;
        routes: Array<{ path: string; title: string }>;
        navigation: Array<{ label: string; href: string; area: string }>;
      }>;
      navigation: { shop: Array<{ label: string; href: string }> };
    };

    const feature = body.features.find((candidate) => candidate.slug === PROBE_SLUG);
    expect(feature).toBeDefined();
    expect(feature?.title).toBe('Probe Capability');
    expect(feature?.routes.some((route) => route.path === '/probe-capability')).toBe(true);
    expect(
      feature?.navigation.some(
        (item) => item.label === 'Probe Capability' && item.href === '/probe-capability',
      ),
    ).toBe(true);
    expect(
      body.navigation.shop.some((item) => item.href === '/probe-capability'),
    ).toBe(true);
  });

  test('route and navigation both resolve', async () => {
    const pageResponse = await fetch(`${server!.baseURL}/probe-capability`);
    expect(pageResponse.status).toBe(200);
    const html = await pageResponse.text();
    expect(html).toContain('Probe capability is live');
    expect(html).toContain('data-probe="yes"');

    const homeResponse = await fetch(`${server!.baseURL}/`);
    expect(homeResponse.status).toBe(200);
    const home = await homeResponse.text();
    expect(home).toContain('Probe Capability');
    expect(home).toContain('/probe-capability');
  });

  test('no shared entry file was edited', () => {
    expect(hashSharedEntryFiles()).toEqual(beforeHashes);
  });
});
