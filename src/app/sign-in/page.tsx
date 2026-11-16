import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { AppShell } from '@/components/ui/AppShell';
import { SignInForm } from '@/features/accounts/sign-in/SignInForm';
import { listCategories } from '@/server/catalogue/service';
import { getFeatureNavigation } from '@/server/features/registry';
import { safeInternalPath } from '@/server/redirects';
import { getSessionUser, SESSION_COOKIE_NAME } from '@/server/session';
import styles from './sign-in.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Sign in',
};

interface SignInPageProps {
  searchParams: { error?: string; next?: string; email?: string };
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid: 'Email or password is incorrect.',
  missing: 'Enter your email and password.',
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const next = safeInternalPath(searchParams.next, '/account');
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  const user = token ? await getSessionUser(token) : null;

  if (user) {
    redirect(next);
  }

  const categories = await listCategories();
  const featureNav = getFeatureNavigation('shop');
  const error = searchParams.error ? ERROR_MESSAGES[searchParams.error] : undefined;

  return (
    <AppShell categories={categories} featureNav={featureNav}>
      <section className={styles.layout} aria-labelledby="sign-in-title">
        <div className={styles.card}>
          <p className={styles.eyebrow}>The shop counter</p>
          <h1 className={styles.title} id="sign-in-title">
            Sign in
          </h1>
          <p className={styles.lead}>
            Your account keeps your orders in one place and remembers you when you come back.
          </p>
          <SignInForm
            error={error}
            next={next}
            email={typeof searchParams.email === 'string' ? searchParams.email : undefined}
          />
        </div>

        <aside className={styles.note} aria-label="About signing in">
          <p className={styles.noteLabel}>A plain counter</p>
          <p className={styles.noteText}>
            One email and password, no tricks. A wrong password and an unknown email get the same
            answer, so nothing is given away.
          </p>
          <p className={styles.noteFoot}>Signing out ends the session on this device.</p>
        </aside>
      </section>
    </AppShell>
  );
}
