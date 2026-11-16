import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { Client } from 'pg';
import { verifyPassword } from '../src/server/passwords';

const SIGN_UP_PAGE = '/sign-up';
const SIGN_UP_API = '/api/accounts/sign-up';

let db: Client;

function freshEmail(): string {
  return `signup-${randomUUID()}@example.test`;
}

async function waitForStyles(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const input = document.querySelector('form input');
      return (
        document.styleSheets.length > 0 &&
        input !== null &&
        getComputedStyle(input).minHeight !== '0px'
      );
    },
    undefined,
    { timeout: 20_000 },
  );
}

test.beforeAll(async () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required by the sign-up tests');
  }
  db = new Client({ connectionString });
  await db.connect();
});

test.afterAll(async () => {
  await db.end();
});

test.describe('customer sign-up', () => {
  test('valid sign-up creates a signed-in account with a slow hash and an HTTP-only cookie', async ({
    page,
    request,
    baseURL,
  }) => {
    const name = 'Asha Rao';
    const email = freshEmail();
    const password = 'SaffronRooftop42';

    await page.goto(baseURL + SIGN_UP_PAGE);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Open a shop account.');
    await page.getByLabel('Name').fill(name);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);

    const [response] = await Promise.all([
      page.waitForResponse(
        (candidate) =>
          candidate.url().endsWith(SIGN_UP_API) && candidate.request().method() === 'POST',
      ),
      page.getByRole('button', { name: 'Create account' }).click(),
    ]);

    expect(response.status()).toBe(201);

    await page.waitForURL((url) => url.pathname === '/');
    await expect(page.getByText('Hi, Asha', { exact: true })).toBeVisible();

    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find((cookie) => cookie.name === 'demo_ecom_session');
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie?.httpOnly).toBe(true);

    const scriptVisibleToJavaScript = await page.evaluate(() => document.cookie);
    expect(scriptVisibleToJavaScript).not.toContain('demo_ecom_session');
    expect(scriptVisibleToJavaScript).not.toContain(password);

    const stored = await db.query<{
      id: string;
      name: string;
      email: string;
      password_hash: string;
      role: string;
    }>(
      'SELECT id, name, email, password_hash, role FROM users WHERE lower(email) = lower($1)',
      [email],
    );
    expect(stored.rowCount).toBe(1);
    const row = stored.rows[0];
    expect(row.name).toBe(name);
    expect(row.email).toBe(email);
    expect(row.role).toBe('customer');
    expect(row.password_hash).not.toBe(password);
    expect(row.password_hash).not.toContain(password);
    expect(row.password_hash.startsWith('scrypt$')).toBe(true);
    expect(row.password_hash.split('$')).toHaveLength(6);
    expect(await verifyPassword(password, row.password_hash)).toBe(true);

    const sessions = await db.query<{ token_hash: string }>(
      'SELECT token_hash FROM sessions WHERE user_id = $1',
      [row.id],
    );
    expect(sessions.rowCount).toBe(1);
    expect(sessions.rows[0].token_hash).not.toContain(password);

    const otherEmail = freshEmail();
    const other = await request.post(SIGN_UP_API, {
      data: { name: 'Ravi Kumar', email: otherEmail, password },
    });
    expect(other.status()).toBe(201);
    const setCookie = (await other.headersArray())
      .filter((header) => header.name.toLowerCase() === 'set-cookie')
      .map((header) => header.value)
      .join('; ');
    expect(setCookie).toContain('demo_ecom_session=');
    expect(setCookie.toLowerCase()).toContain('httponly');
    const otherStored = await db.query<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE lower(email) = lower($1)',
      [otherEmail],
    );
    expect(otherStored.rows[0].password_hash).not.toBe(row.password_hash);
  });

  test('duplicate email is refused without a second row or session, and invalid fields are field-level 4xx', async ({
    request,
  }) => {
    const email = freshEmail();
    const password = 'SaffronRooftop42';

    const first = await request.post(SIGN_UP_API, {
      data: { name: 'Meera Iyer', email, password },
    });
    expect(first.status()).toBe(201);

    const stored = await db.query<{ id: string }>(
      'SELECT id FROM users WHERE lower(email) = lower($1)',
      [email],
    );
    expect(stored.rowCount).toBe(1);
    const userId = stored.rows[0].id;

    const sessionsBefore = await db.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM sessions WHERE user_id = $1',
      [userId],
    );

    const duplicate = await request.post(SIGN_UP_API, {
      data: { name: 'Meera Again', email: email.toUpperCase(), password: 'AnotherPassword9' },
    });
    expect(duplicate.status()).toBe(409);
    const duplicateCookies = (await duplicate.headersArray()).filter(
      (header) => header.name.toLowerCase() === 'set-cookie',
    );
    expect(duplicateCookies).toEqual([]);
    const duplicateBody = (await duplicate.json()) as {
      message: string;
      fieldErrors: Record<string, string>;
    };
    expect(duplicateBody.message).toMatch(/already exists/i);
    expect(duplicateBody.fieldErrors.email).toMatch(/already exists/i);

    const usersAfter = await db.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM users WHERE lower(email) = lower($1)',
      [email],
    );
    expect(usersAfter.rows[0].count).toBe(1);

    const sessionsAfter = await db.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM sessions WHERE user_id = $1',
      [userId],
    );
    expect(sessionsAfter.rows[0].count).toBe(sessionsBefore.rows[0].count);

    const invalidEmail = 'not-an-email';
    const invalid = await request.post(SIGN_UP_API, {
      data: { name: 'Kabir Sen', email: invalidEmail, password: 'short' },
    });
    expect(invalid.status()).toBe(422);
    const invalidBody = (await invalid.json()) as {
      message: string;
      fieldErrors: Record<string, string>;
    };
    expect(invalidBody.fieldErrors.email).toMatch(/valid email/i);
    expect(invalidBody.fieldErrors.password).toMatch(/8 characters/i);

    const noRow = await db.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM users WHERE lower(email) = lower($1)',
      [invalidEmail],
    );
    expect(noRow.rows[0].count).toBe(0);

    const missing = await request.post(SIGN_UP_API, { data: {} });
    expect(missing.status()).toBe(422);
    const missingBody = (await missing.json()) as { fieldErrors: Record<string, string> };
    expect(missingBody.fieldErrors.name).toBeTruthy();
    expect(missingBody.fieldErrors.email).toBeTruthy();
    expect(missingBody.fieldErrors.password).toBeTruthy();
  });

  test('sign-up page is composed at phone and desktop widths', async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(baseURL + SIGN_UP_PAGE);
    await waitForStyles(page);
    await page.evaluate(() => document.fonts.ready);

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByLabel('Name')).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();

    const phone = await page.evaluate(() => {
      const overflow = document.documentElement.scrollWidth - window.innerWidth;
      const controls = [...document.querySelectorAll('form input, form button')].map((element) => {
        const rect = element.getBoundingClientRect();
        return { tag: element.tagName, width: rect.width, height: rect.height };
      });
      return { overflow, controls };
    });
    expect(phone.overflow).toBeLessThanOrEqual(1);
    for (const control of phone.controls) {
      expect(control.width, `${control.tag} width`).toBeGreaterThanOrEqual(44);
      expect(control.height, `${control.tag} height`).toBeGreaterThanOrEqual(44);
    }

    await expect(page).toHaveScreenshot('sign-up-phone.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(baseURL + SIGN_UP_PAGE);
    await waitForStyles(page);
    await page.evaluate(() => document.fonts.ready);

    const desktop = await page.evaluate(() => {
      const main = document.querySelector('main');
      const card = document.querySelector('form');
      if (!main || !card) {
        return null;
      }
      const mainRect = main.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      return {
        width: mainRect.width,
        left: mainRect.left,
        viewport: window.innerWidth,
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        cardWidth: cardRect.width,
      };
    });
    expect(desktop).not.toBeNull();
    expect(desktop!.overflow).toBeLessThanOrEqual(1);
    expect(desktop!.width).toBeGreaterThanOrEqual(1000);
    expect(desktop!.width / desktop!.viewport).toBeGreaterThan(0.7);
    expect(desktop!.left).toBeLessThanOrEqual(160);
    expect(desktop!.cardWidth).toBeGreaterThanOrEqual(320);

    await expect(page).toHaveScreenshot('sign-up-desktop.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });
});
