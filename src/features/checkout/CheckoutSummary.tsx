import { Lock } from 'lucide-react';
import { PriceTag } from '@/components/ui/PriceTag';
import { formatINR } from '@/lib/money';
import type { CheckoutTotals } from './types';
import styles from './CheckoutSummary.module.css';

export interface SummaryLine {
  id: string;
  name: string;
  quantity: number;
  lineTotalPaise: number;
}

export interface CheckoutSummaryProps {
  totals: CheckoutTotals;
  lines: SummaryLine[];
  itemCount: number;
}

export function CheckoutSummary({ totals, lines, itemCount }: CheckoutSummaryProps) {
  const itemLabel = itemCount === 1 ? '1 item' : `${itemCount} items`;

  return (
    <section className={styles.summary} aria-labelledby="checkout-summary-title">
      <p className={styles.kicker}>The bill</p>
      <h2 className={styles.title} id="checkout-summary-title">
        Order summary
      </h2>

      <ul className={styles.lines} data-testid="checkout-lines">
        {lines.map((line) => (
          <li className={styles.line} key={line.id}>
            <span className={styles.lineName}>
              {line.name}
              <span className={styles.lineQty}> × {line.quantity}</span>
            </span>
            <span className={styles.lineAmount}>{formatINR(line.lineTotalPaise)}</span>
          </li>
        ))}
      </ul>

      <dl className={styles.rows}>
        <div className={styles.row}>
          <dt>Subtotal · {itemLabel}</dt>
          <dd data-testid="checkout-subtotal">
            <PriceTag amountPaise={totals.subtotalPaise} size="sm" label="Subtotal" />
          </dd>
        </div>
        <div className={styles.row}>
          <dt>Delivery</dt>
          <dd data-testid="checkout-delivery">
            {totals.deliveryChargePaise === 0 ? (
              <span className={styles.free}>Free</span>
            ) : (
              <PriceTag amountPaise={totals.deliveryChargePaise} size="sm" label="Delivery" />
            )}
          </dd>
        </div>
        <div className={`${styles.row} ${styles.totalRow}`}>
          <dt>Total payable</dt>
          <dd data-testid="checkout-total">
            <PriceTag amountPaise={totals.totalPaise} size="lg" label="Total payable" />
          </dd>
        </div>
      </dl>

      <p className={styles.note}>
        All prices are in Indian rupees (INR). Delivery is ₹49 below ₹500 and free from ₹500.
      </p>
      <p className={styles.secure}>
        <Lock aria-hidden="true" size={15} strokeWidth={1.6} />
        Payment opens in Razorpay. The shop never sees your card.
      </p>
    </section>
  );
}
