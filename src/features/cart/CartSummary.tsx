import Link from 'next/link';
import { PriceTag } from '@/components/ui/PriceTag';
import type { Cart } from './types';
import styles from './CartSummary.module.css';

export function CartSummary({ cart }: { cart: Cart }) {
  const itemLabel = cart.itemCount === 1 ? '1 item' : `${cart.itemCount} items`;

  return (
    <section className={styles.summary} aria-labelledby="cart-summary-title">
      <p className={styles.kicker}>The bill</p>
      <h2 className={styles.title} id="cart-summary-title">
        Order summary
      </h2>

      <dl className={styles.rows}>
        <div className={styles.row}>
          <dt>Subtotal · {itemLabel}</dt>
          <dd data-testid="cart-subtotal">
            <PriceTag amountPaise={cart.subtotalPaise} size="lg" label="Subtotal" />
          </dd>
        </div>
      </dl>

      <p className={styles.note}>
        All prices are in Indian rupees (INR) and counted on the shop&rsquo;s server. Delivery is
        worked out at checkout.
      </p>

      <Link className={styles.continue} href="/">
        Keep shopping
      </Link>
    </section>
  );
}
