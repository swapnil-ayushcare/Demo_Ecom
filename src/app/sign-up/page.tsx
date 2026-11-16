import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/ui/AppShell';
import { SignUpForm } from '@/features/accounts/sign-up/SignUpForm';
import { getCurrentUser } from '@/features/accounts/sign-up/current-user';
import { listCategories } from '@/server/catalogue/service';
import { getFeatureNavigation } from '@/server/features/registry';
import styles from './sign-up.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Create your account',
  description:
    'Open a Demo_Ecom account to keep your orders together and see where each one has reached.',
};

export default async function SignUpPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect('/');
  }

  const [categories, featureNav] = await Promise.all([
    listCategories(),
    Promise.resolve(getFeatureNavigation('shop')),
  ]);

  return (
    <AppShell categories={categories} featureNav={featureNav}>
      <div className={styles.layout}>
        <section className={styles.intro} aria-labelledby="sign-up-title">
          <p className={styles.eyebrow}>The shop counter</p>
          <h1 className={styles.title} id="sign-up-title">
            Open a shop account.
          </h1>
          <p className={styles.lede}>
            One name, one email, one password — then the shop remembers your orders and keeps
            them where you can find them.
          </p>

          <ul className={styles.points}>
            <li>
              <span className={styles.pointMark} aria-hidden="true">
                1
              </span>
              <span>
                <strong>Your orders in one place.</strong> Every purchase and its delivery status
                sits under your account, not in an inbox you have to search.
              </span>
            </li>
            <li>
              <span className={styles.pointMark} aria-hidden="true">
                2
              </span>
              <span>
                <strong>Plain prices in rupees.</strong> The total is counted on the server, so
                the cart, the checkout and the order always agree.
              </span>
            </li>
            <li>
              <span className={styles.pointMark} aria-hidden="true">
                3
              </span>
              <span>
                <strong>No card details kept here.</strong> Payment opens in Razorpay; the shop
                records only that it was paid.
              </span>
            </li>
          </ul>

          <p className={styles.note}>
            No newsletter, no countdown. An account is simply how the shop knows whose order is
            whose.
          </p>
        </section>

        <section className={styles.formCard} aria-labelledby="form-title">
          <div className={styles.formHead}>
            <h2 className={styles.formTitle} id="form-title">
              Your details
            </h2>
            <p className={styles.formNote}>Takes a minute. Your password is never stored as text.</p>
          </div>
          <SignUpForm />
        </section>
      </div>
    </AppShell>
  );
}
