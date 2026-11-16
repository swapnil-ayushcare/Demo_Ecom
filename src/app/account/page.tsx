import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { AppShell } from '@/components/ui/AppShell';
import { listCategories } from '@/server/catalogue/service';
import { getFeatureNavigation } from '@/server/features/registry';
import { getSessionUser, SESSION_COOKIE_NAME } from '@/server/session';
import styles from './account.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your account',
};

export default async function AccountPage() {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  const user = token ? await getSessionUser(token) : null;

  if (!user) {
    redirect('/sign-in?next=/account');
  }

  const categories = await listCategories();
  const featureNav = getFeatureNavigation('shop');

  return (
    <AppShell categories={categories} featureNav={featureNav}>
      <section className={styles.layout} aria-labelledby="account-title">
        <div className={styles.card}>
          <p className={styles.eyebrow}>Your account</p>
          <h1 className={styles.title} id="account-title">
            Hello, {user.name}
          </h1>
          <p className={styles.lead}>
            You are signed in as <strong>{user.email}</strong>.
          </p>

          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>Your orders</h2>
            <p className={styles.panelText}>
              Orders you place will appear here with their status, so you can follow them from the
              counter to your door.
            </p>
          </div>

          <form className={styles.signOut} action="/api/auth/sign-out" method="post">
            <button className={styles.signOutButton} type="submit">
              Sign out
            </button>
          </form>
        </div>
      </section>
    </AppShell>
  );
}
