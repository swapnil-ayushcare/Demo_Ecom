import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';

interface FirebaseConfig {
  hosting: {
    site: string;
    public: string;
    ignore?: string[];
  };
}

interface FileDigest {
  path: string;
  hash: string;
  text: string;
}

const root = process.cwd();
const configPath = join(root, 'firebase.json');
const buildScript = join(root, 'scripts', 'build-hosting.mjs');
const outputDir = join(root, 'hosting-dist');

function readConfig(): FirebaseConfig {
  return JSON.parse(readFileSync(configPath, 'utf8')) as FirebaseConfig;
}

function runBuild(): void {
  const result = spawnSync(process.execPath, [buildScript], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`build-hosting.mjs failed: ${result.stderr || result.stdout}`);
  }
}

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      files.push(...walk(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

function digestOutput(): FileDigest[] {
  return walk(outputDir).map((file) => {
    const bytes = readFileSync(file);
    return {
      path: relative(outputDir, file).split(sep).join('/'),
      hash: createHash('sha256').update(bytes).digest('hex'),
      text: bytes.toString('utf8'),
    };
  });
}

function expectValidSiteId(site: string): void {
  expect(site).not.toBe('demo-ecom');
  expect(site).not.toMatch(/^-|-$/);
  expect(site).toMatch(/^[a-z0-9][a-z0-9-]{4,28}[a-z0-9]$/);
  expect(site.length).toBeLessThanOrEqual(30);
}

test.describe('publishing configuration', () => {
  test('declares a non-reserved hosting site id and a deterministic static build', () => {
    expect(statSync(configPath).isFile()).toBe(true);
    expect(statSync(buildScript).isFile()).toBe(true);

    const config = readConfig();
    expectValidSiteId(config.hosting.site);
    expect(config.hosting.public).toBe('hosting-dist');

    runBuild();
    const first = digestOutput();
    const firstIndex = first.find((file) => file.path === 'index.html');
    expect(firstIndex).toBeDefined();
    expect(firstIndex?.text).toContain('Demo_Ecom');
    expect(firstIndex?.text).toContain('npm run dev');
    expect(firstIndex?.text).not.toMatch(/<script\b/i);

    const checksums = first.find((file) => file.path === 'checksums.sha256');
    expect(checksums).toBeDefined();
    const expectedLines = first
      .filter((file) => file.path !== 'checksums.sha256')
      .map((file) => `${file.hash}  ${file.path}`)
      .join('\n');
    expect(checksums?.text.trim()).toBe(expectedLines);

    runBuild();
    const second = digestOutput();
    expect(second).toEqual(first);

    const combined = first.map((file) => file.text).join('\n');
    for (const secret of [
      process.env.SESSION_SECRET,
      process.env.RAZORPAY_KEY_SECRET,
      process.env.RAZORPAY_KEY_ID,
    ]) {
      if (secret && secret.length >= 8) {
        expect(combined).not.toContain(secret);
      }
    }
    expect(combined).not.toMatch(/\brzp_(test|live)_[A-Za-z0-9]+/);
    expect(combined).not.toMatch(/FIREBASE_TOKEN/);
  });

  test('the publish script deploys the declared site and never needs a token', () => {
    const script = readFileSync(join(root, 'orbit', 'publish.sh'), 'utf8');

    expect(script).toContain('firebase.json');
    expect(script).toContain('hosting:sites:create');
    expect(script).toContain('hosting:channel:deploy');
    expect(script).toContain('FIREBASE_PROJECT_ID');
    expect(script).toContain('ORBIT_URL_FILE');
    expect(script).not.toContain('FIREBASE_TOKEN');
    expect(script).not.toMatch(/--token\b/);
    expect(script).toContain('demo-ecom');
  });

  test('the release marker fits a phone and uses a desktop width', async ({ page }) => {
    runBuild();
    const url = pathToFileURL(join(outputDir, 'index.html')).href;

    await page.setViewportSize({ width: 375, height: 844 });
    await page.goto(url);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('npm ci', { exact: true })).toBeVisible();

    const phone = await page.evaluate(() => {
      const heading = document.querySelector('h1');
      const codes = [...document.querySelectorAll('code')];
      const links = [...document.querySelectorAll('a')];
      return {
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        headingSize: heading ? parseFloat(getComputedStyle(heading).fontSize) : 0,
        clippedCodes: codes.filter((code) => code.scrollWidth > code.clientWidth + 1).length,
        shortTargets: links.filter((link) => link.getBoundingClientRect().height < 44).length,
      };
    });
    expect(phone.overflow).toBeLessThanOrEqual(1);
    expect(phone.headingSize).toBeGreaterThanOrEqual(28);
    expect(phone.clippedCodes).toBe(0);
    expect(phone.shortTargets).toBe(0);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(url);
    const desktop = await page.evaluate(() => {
      const main = document.querySelector('main');
      return {
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        mainWidth: main ? main.getBoundingClientRect().width : 0,
      };
    });
    expect(desktop.overflow).toBeLessThanOrEqual(1);
    expect(desktop.mainWidth).toBeGreaterThanOrEqual(1440 * 0.75);
  });
});
