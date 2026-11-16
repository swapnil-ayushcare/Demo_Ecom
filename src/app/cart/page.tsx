import type { Metadata } from 'next';
import { AppShell } from '@/components/ui/AppShell';
import { CartView } from '@/features/cart/CartView';
import { getCurrentCart } from '@/features/cart/currentCart';
import { listCategories } from '@/server/catalogue/service';
import { getFeatureNavigation } from '@/server/features/registry';
import styles from './cart.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your cart',
  description:
    'Review the things you have picked up, change quantities and see the rupee subtotal.',
};

export default async function CartPage() {
  const [{ cart, signedIn }, categories] = await Promise.all([
    getCurrentCart(),
    listCategories(),
  ]);
  const featureNav = getFeatureNavigation('shop');

  return (
    <AppShell categories={categories} featureNav={featureNav}>
      <section className={styles.head} aria-labelledby="cart-title">
        <p className={styles.eyebrow}>At the counter</p>
        <h1 className={styles.title} id="cart-title">
          Your cart
        </h1>
        <p className={styles.lede}>
          {cart.lines.length === 0
            ? 'Nothing picked up yet. The aisle is one tap back.'
            : `${cart.itemCount === 1 ? 'One item' : `${cart.itemCount} items`} on the counter. Change a quantity or take something out — the bill keeps up.`}
        </p>
        <p className={styles.savedNote}>
          {signedIn
            ? 'Saved to your account, so this cart is here after a refresh.'
            : 'Kept in this browser with a private token, and never shared with another browser.'}
        </p>
      </section>

      <CartView initialCart={cart} />
    </AppShell>
  );
}
