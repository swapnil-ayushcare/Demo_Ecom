import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { CheckCircle2, ClipboardList } from 'lucide-react';
import { AppShell } from '@/components/ui/AppShell';
import { PriceTag } from '@/components/ui/PriceTag';
import { getCurrentUser } from '@/features/accounts/sign-up/current-user';
import { getOrderConfirmation } from '@/features/checkout/getOrderConfirmation';
import { formatINR } from '@/lib/money';
import { listCategories } from '@/server/catalogue/service';
import { getFeatureNavigation } from '@/server/features/registry';
import styles from './confirmation.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Order confirmation',
};

interface ConfirmationPageProps {
  params: { orderNumber: string };
}

export default async function ConfirmationPage({ params }: ConfirmationPageProps) {
  const user = await getCurrentUser();
  const orderNumber = decodeURIComponent(params.orderNumber);

  if (!user) {
    redirect(`/sign-in?next=${encodeURIComponent(`/checkout/confirmation/${orderNumber}`)}`);
  }

  const order = await getOrderConfirmation(user.id, orderNumber);
  if (!order) {
    notFound();
  }

  const categories = await listCategories();
  const featureNav = getFeatureNavigation('shop');
  const statusLabel = order.paymentStatus === 'paid' ? 'Paid' : order.paymentStatus;

  return (
    <AppShell categories={categories} featureNav={featureNav}>
      <section className={styles.band} aria-labelledby="confirmation-title">
        <p className={styles.badge}>
          <CheckCircle2 aria-hidden="true" size={18} strokeWidth={1.7} />
          Payment received
        </p>
        <p className={styles.eyebrow}>The shop counter</p>
        <h1 className={styles.title} id="confirmation-title">
          Order <span data-testid="order-number">{order.orderNumber}</span> is placed.
        </h1>
        <p className={styles.lede}>
          Paid <strong>{formatINR(order.totalPaise)}</strong> in Indian rupees. The shop has your
          order and will move it along from placed to delivered.
        </p>
      </section>

      <div className={styles.grid}>
        <section className={styles.card} aria-labelledby="confirmation-items-title">
          <div className={styles.cardHead}>
            <ClipboardList aria-hidden="true" size={20} strokeWidth={1.6} />
            <h2 className={styles.cardTitle} id="confirmation-items-title">
              What you bought
            </h2>
          </div>
          <ul className={styles.items}>
            {order.items.map((item) => (
              <li className={styles.item} key={`${item.productName}-${item.unitPricePaise}`}>
                <span className={styles.itemName}>
                  {item.productName}
                  <span className={styles.itemQty}> × {item.quantity}</span>
                </span>
                <span className={styles.itemAmount}>{formatINR(item.lineTotalPaise)}</span>
              </li>
            ))}
          </ul>

          <dl className={styles.totals}>
            <div className={styles.totalRow}>
              <dt>Subtotal</dt>
              <dd>{formatINR(order.subtotalPaise)}</dd>
            </div>
            <div className={styles.totalRow}>
              <dt>Delivery</dt>
              <dd>
                {order.deliveryChargePaise === 0 ? (
                  <span className={styles.free}>Free</span>
                ) : (
                  formatINR(order.deliveryChargePaise)
                )}
              </dd>
            </div>
            <div className={`${styles.totalRow} ${styles.grandRow}`}>
              <dt>Total paid</dt>
              <dd data-testid="confirmation-total">
                <PriceTag amountPaise={order.totalPaise} size="lg" label="Total paid" />
              </dd>
            </div>
          </dl>

          <p className={styles.statusLine}>
            Payment status: <span className={styles.paid}>{statusLabel}</span>
            <span data-testid="confirmation-status" className={styles.srOnly}>
              {statusLabel}
            </span>
          </p>
        </section>

        <section className={styles.card} aria-labelledby="confirmation-address-title">
          <div className={styles.cardHead}>
            <CheckCircle2 aria-hidden="true" size={20} strokeWidth={1.6} />
            <h2 className={styles.cardTitle} id="confirmation-address-title">
              Delivering to
            </h2>
          </div>
          <address className={styles.address} data-testid="confirmation-address">
            <strong>{order.address.name}</strong>
            <span>{order.address.phone}</span>
            <span>
              {order.address.line1}
              {order.address.line2 ? `, ${order.address.line2}` : ''}
            </span>
            <span>
              {order.address.city}, {order.address.state} {order.address.pincode}
            </span>
          </address>
          <p className={styles.note}>
            The shop keeps only the Razorpay payment result. No card number, CVV or expiry is stored
            with this order.
          </p>
          <div className={styles.actions}>
            <Link className={styles.primary} href="/">
              Keep shopping
            </Link>
            <Link className={styles.secondary} href="/cart">
              View cart
            </Link>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
