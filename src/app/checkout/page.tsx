import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ShoppingBag } from 'lucide-react';
import { AppShell } from '@/components/ui/AppShell';
import { getCurrentCart } from '@/features/cart/currentCart';
import { getCurrentUser } from '@/features/accounts/sign-up/current-user';
import { CheckoutFlow } from '@/features/checkout/CheckoutFlow';
import { totalsForSubtotal } from '@/features/checkout/delivery';
import {
  razorpayKeyId,
  razorpaySandboxEnabled,
} from '@/features/checkout/razorpay';
import { listCategories } from '@/server/catalogue/service';
import { getFeatureNavigation } from '@/server/features/registry';
import styles from './checkout.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Checkout',
  description:
    'Add a delivery address, see the delivery charge and the final rupee total, then pay in Razorpay test mode.',
};

export default async function CheckoutPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/sign-in?next=/checkout');
  }

  const [{ cart }, categories] = await Promise.all([
    getCurrentCart(),
    listCategories(),
  ]);
  const featureNav = getFeatureNavigation('shop');
  const totals = totalsForSubtotal(cart.subtotalPaise);

  return (
    <AppShell categories={categories} featureNav={featureNav}>
      <section className={styles.head} aria-labelledby="checkout-title">
        <p className={styles.eyebrow}>At the counter</p>
        <h1 className={styles.title} id="checkout-title">
          Checkout
        </h1>
        <p className={styles.lede}>
          {cart.lines.length === 0
            ? 'There is nothing on the counter to pay for yet.'
            : 'One last step: where should it go, then pay. The bill is counted on the shop’s server.'}
        </p>
      </section>

      {cart.lines.length === 0 ? (
        <div className={styles.empty} data-testid="checkout-empty">
          <span className={styles.emptyIcon} aria-hidden="true">
            <ShoppingBag size={30} strokeWidth={1.4} />
          </span>
          <p className={styles.emptyTitle}>Your cart is empty.</p>
          <p className={styles.emptyText}>
            Pick something up from the shelves first, then come back here to pay.
          </p>
          <Link className={styles.emptyLink} href="/">
            Browse the shop
          </Link>
        </div>
      ) : (
        <CheckoutFlow
          cart={cart}
          totals={totals}
          keyId={razorpayKeyId()}
          sandbox={razorpaySandboxEnabled()}
          customer={{ name: user.name, email: user.email }}
        />
      )}
    </AppShell>
  );
}
