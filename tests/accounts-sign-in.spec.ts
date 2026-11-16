import { expect, test, type Page } from '@playwright/test';
import { closeDatabases, query } from '../src/server/db';
import { hashToken } from '../src/server/passwords';
import {
  establishSession,
  revokeSession,
  serializeSessionCookie,
  SESSION_COOKIE_NAME,
} from '../src/server/session';
import { createFixture } from '../src/test/fixtures';

test.afterAll(async () => {
  await closeDatabases();
});

async function submitSignIn(page: Page, email: string, password: string): Promise<void> {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test.describe('customer sign-in', () => {
  test('correct password opens a session and wrong passwords are refused identically', async ({
    page,
  }) => {
    const fixture = createFixture();
    const password = 'FixtureCounter123!';
    const customer = await fixture.user({ password });
    const unknownEmail = `unknown-${Date.now()}@example.test`;

    await page.goto('/sign-in');
    await submitSignIn(page, customer.email, 'not-the-password');
    await page.waitForURL(/\/sign-in\?error=invalid/);
    const knownRefusal = await page.locator('p[role="alert"]').innerText();
    expect(knownRefusal).toBe('Email or password is incorrect.');

    await page.goto('/sign-in');
    await submitSignIn(page, unknownEmail, 'not-the-password');
    await page.waitForURL(/\/sign-in\?error=invalid/);
    const unknownRefusal = await page.locator('p[role="alert"]').innerText();
    expect(unknownRefusal).toBe(knownRefusal);

    await page.goto('/sign-in');
    await submitSignIn(page, customer.email, password);
    await page.waitForURL((url) => url.pathname === '/account');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Hello,');
    await expect(page.getByText(customer.email)).toBeVisible();

    const sessionCookie = (await page.context().cookies()).find(
      (cookie) => cookie.name === SESSION_COOKIE_NAME,
    );
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie?.httpOnly).toBe(true);
  });

  test('a live session survives a new context and logout kills the cookie', async ({
    page,
    browser,
  }) => {
    const fixture = createFixture();
    const password = 'FixtureCounter123!';
    const customer = await fixture.user({ password });

    await page.goto('/sign-in');
    await submitSignIn(page, customer.email, password);
    await page.waitForURL((url) => url.pathname === '/account');

    const captured = (await page.context().cookies()).find(
      (cookie) => cookie.name === SESSION_COOKIE_NAME,
    );
    expect(captured).toBeDefined();

    const liveContext = await browser.newContext();
    await liveContext.addCookies([captured!]);
    const livePage = await liveContext.newPage();
    await livePage.goto('/account');
    await expect(livePage.getByText(customer.email)).toBeVisible();

    await Promise.all([
      livePage.waitForURL((url) => url.pathname === '/'),
      livePage.getByRole('button', { name: 'Sign out' }).click(),
    ]);

    const cleared = (await liveContext.cookies()).find(
      (cookie) => cookie.name === SESSION_COOKIE_NAME,
    );
    expect(cleared?.value ?? '').toBe('');

    const stored = await query<{ revoked_at: Date | null }>(
      'SELECT revoked_at FROM sessions WHERE token_hash = $1',
      [hashToken(captured!.value)],
    );
    expect(stored.rows[0]?.revoked_at).not.toBeNull();
    await liveContext.close();

    const replayContext = await browser.newContext();
    await replayContext.addCookies([captured!]);
    const replayPage = await replayContext.newPage();
    await replayPage.goto('/account');
    await replayPage.waitForURL(/\/sign-in\?next=/);
    await expect(replayPage.getByRole('heading', { level: 1 })).toHaveText('Sign in');
    await expect(replayPage.getByText(customer.email)).toHaveCount(0);
    await replayContext.close();

  });

  test('session cookie is HTTP-only and Secure when production security is on', async () => {
    const fixture = createFixture();
    const customer = await fixture.user();
    const session = await establishSession(customer.id, { secure: true });

    expect(session.cookie.options.httpOnly).toBe(true);
    expect(session.cookie.options.secure).toBe(true);
    expect(serializeSessionCookie(session)).toContain('Secure');

    await revokeSession(session.token);
  });
});
