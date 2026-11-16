'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, CreditCard, Lock, Smartphone } from 'lucide-react';
import type { Cart } from '@/features/cart/types';
import { formatINR } from '@/lib/money';
import { AddressForm } from './AddressForm';
import { CheckoutSummary } from './CheckoutSummary';
import type {
  AddressFieldErrors,
  CheckoutSessionView,
  CheckoutTotals,
  DeliveryAddress,
} from './types';
import styles from './CheckoutFlow.module.css';

type PaymentState = 'idle' | 'processing' | 'failed' | 'cancelled';

interface CheckoutSessionResponse {
  checkoutSession?: CheckoutSessionView;
  message?: string;
  fieldErrors?: AddressFieldErrors;
}

interface VerifyResponse {
  order?: { orderNumber?: string; totalPaise?: number };
  message?: string;
}

interface SandboxPaymentResponse {
  status?: 'created' | 'cancelled';
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
  message?: string;
}

export interface CheckoutFlowProps {
  cart: Cart;
  totals: CheckoutTotals;
  keyId: string;
  sandbox: boolean;
  customer: { name: string; email: string };
}

let razorpayScriptPromise: Promise<void> | null = null;

function loadRazorpayScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Razorpay needs a browser'));
  }
  if (window.Razorpay) {
    return Promise.resolve();
  }
  if (razorpayScriptPromise) {
    return razorpayScriptPromise;
  }

  razorpayScriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.dataset.razorpayCheckout = 'true';
    script.onload = () => resolve();
    script.onerror = () => {
      razorpayScriptPromise = null;
      reject(new Error('Razorpay Checkout could not load'));
    };
    document.head.appendChild(script);
  });

  return razorpayScriptPromise;
}

export function CheckoutFlow({ cart, totals, keyId, sandbox, customer }: CheckoutFlowProps) {
  const router = useRouter();
  const [values, setValues] = useState<DeliveryAddress>({
    name: customer.name,
    phone: '',
    line1: '',
    line2: '',
    city: '',
    state: '',
    pincode: '',
  });
  const [fieldErrors, setFieldErrors] = useState<AddressFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [session, setSession] = useState<CheckoutSessionView | null>(null);
  const [paymentState, setPaymentState] = useState<PaymentState>('idle');
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);

  const shownTotals: CheckoutTotals = session ?? totals;
  const busy = pending || paymentState === 'processing';

  async function startCheckout(): Promise<void> {
    setPending(true);
    setFieldErrors({});
    setFormError(null);
    setPaymentMessage(null);
    setPaymentState('idle');

    try {
      const response = await fetch('/api/checkout/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: values }),
      });

      if (response.status === 401) {
        router.push('/sign-in?next=/checkout');
        return;
      }

      const body = (await response.json().catch(() => null)) as CheckoutSessionResponse | null;
      if (!response.ok || !body?.checkoutSession) {
        setFieldErrors(body?.fieldErrors ?? {});
        setFormError(body?.message ?? 'We could not start the checkout. Try again.');
        return;
      }

      setSession(body.checkoutSession);
    } catch {
      setFormError('We could not reach the shop. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  }

  function changeAddress(): void {
    setSession(null);
    setPaymentState('idle');
    setPaymentMessage(null);
  }

  async function verifyPayment(input: {
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    razorpay_signature?: string;
  }): Promise<void> {
    if (!session) {
      return;
    }

    setPaymentState('processing');
    setPaymentMessage(null);

    try {
      const response = await fetch('/api/checkout/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkoutSessionId: session.id,
          razorpay_order_id: input.razorpay_order_id,
          razorpay_payment_id: input.razorpay_payment_id,
          razorpay_signature: input.razorpay_signature,
        }),
      });

      if (response.status === 401) {
        router.push('/sign-in?next=/checkout');
        return;
      }

      const body = (await response.json().catch(() => null)) as VerifyResponse | null;
      if (!response.ok || !body?.order?.orderNumber) {
        setPaymentState('failed');
        setPaymentMessage(
          body?.message ??
            'We could not confirm this payment, so no order was created. Your cart is unchanged.',
        );
        return;
      }

      router.push(`/checkout/confirmation/${encodeURIComponent(body.order.orderNumber)}`);
    } catch {
      setPaymentState('failed');
      setPaymentMessage(
        'We could not reach the shop to confirm the payment. Your cart is unchanged; try again.',
      );
    }
  }

  async function payInSandbox(method: 'upi' | 'card'): Promise<void> {
    if (!session) {
      return;
    }

    setPaymentState('processing');
    setPaymentMessage(null);

    try {
      const response = await fetch('/api/checkout/sandbox/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkoutSessionId: session.id, method }),
      });

      if (response.status === 401) {
        router.push('/sign-in?next=/checkout');
        return;
      }

      const body = (await response.json().catch(() => null)) as SandboxPaymentResponse | null;
      if (!response.ok) {
        setPaymentState('failed');
        setPaymentMessage(body?.message ?? 'The test payment could not start. Try again.');
        return;
      }

      if (body?.status === 'cancelled') {
        setPaymentState('cancelled');
        setPaymentMessage('Payment cancelled. Your cart is unchanged and no order was created.');
        return;
      }

      await verifyPayment(body ?? {});
    } catch {
      setPaymentState('failed');
      setPaymentMessage(
        'We could not reach the shop to confirm the payment. Your cart is unchanged; try again.',
      );
    }
  }

  async function cancelPayment(): Promise<void> {
    if (!session) {
      return;
    }

    setPaymentState('processing');
    setPaymentMessage(null);

    try {
      await fetch('/api/checkout/sandbox/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkoutSessionId: session.id, method: 'cancel' }),
      });
    } catch {
      // A cancellation is the customer walking away; the cart is untouched.
    }

    setPaymentState('cancelled');
    setPaymentMessage('Payment cancelled. Your cart is unchanged and no order was created.');
  }

  async function payWithRazorpay(): Promise<void> {
    if (!session) {
      return;
    }

    setPaymentState('processing');
    setPaymentMessage(null);

    try {
      await loadRazorpayScript();
      if (!window.Razorpay) {
        throw new Error('Razorpay Checkout is unavailable');
      }

      const checkout = new window.Razorpay({
        key: keyId,
        amount: session.totalPaise,
        currency: 'INR',
        name: 'Demo_Ecom',
        description: `${formatINR(session.totalPaise)} for ${cart.itemCount} ${
          cart.itemCount === 1 ? 'item' : 'items'
        }`,
        order_id: session.razorpayOrderId,
        prefill: {
          name: values.name,
          email: customer.email,
          contact: values.phone,
        },
        notes: { shop: 'Demo_Ecom' },
        theme: { color: '#d96c2f' },
        handler: (response) => {
          void verifyPayment(response);
        },
        modal: {
          ondismiss: () => {
            setPaymentState('cancelled');
            setPaymentMessage(
              'Payment cancelled. Your cart is unchanged and no order was created.',
            );
          },
        },
      });

      checkout.on('payment.failed', () => {
        setPaymentState('failed');
        setPaymentMessage(
          'The payment did not go through, so no order was created. Your cart is unchanged.',
        );
      });

      checkout.open();
    } catch {
      setPaymentState('failed');
      setPaymentMessage(
        'Razorpay Checkout could not open. Your cart is unchanged; check the connection and try again.',
      );
    }
  }

  return (
    <div className={styles.layout}>
      <div className={styles.addressColumn}>
        {session ? (
          <section className={styles.panel} aria-labelledby="checkout-address-title">
            <div className={styles.panelHead}>
              <div>
                <p className={styles.kicker}>Delivery</p>
                <h2 className={styles.panelTitle} id="checkout-address-title">
                  Where should it go?
                </h2>
              </div>
              <button className={styles.change} type="button" onClick={changeAddress}>
                Change address
              </button>
            </div>
            <address className={styles.recap} data-testid="checkout-address-recap">
              <strong>{values.name}</strong>
              <span>{values.phone}</span>
              <span>
                {values.line1}
                {values.line2 ? `, ${values.line2}` : ''}
              </span>
              <span>
                {values.city}, {values.state} {values.pincode}
              </span>
            </address>
          </section>
        ) : (
          <section className={styles.panel} aria-labelledby="checkout-address-title">
            <p className={styles.kicker}>Delivery</p>
            <h2 className={styles.panelTitle} id="checkout-address-title">
              Where should it go?
            </h2>
            <p className={styles.panelNote}>
              We deliver inside India. The delivery charge is worked out on the server before you
              pay.
            </p>
            <AddressForm
              values={values}
              fieldErrors={fieldErrors}
              formError={formError}
              pending={pending}
              onChange={setValues}
              onSubmit={() => {
                void startCheckout();
              }}
            />
          </section>
        )}
      </div>

      <div className={styles.summaryColumn}>
        <CheckoutSummary totals={shownTotals} lines={cart.lines} itemCount={cart.itemCount} />
      </div>

      {session ? (
        <div className={styles.paymentColumn}>
          <section
            className={styles.panel}
            aria-labelledby="checkout-payment-title"
            data-testid="checkout-payment-step"
          >
            <p className={styles.kicker}>Payment</p>
            <h2 className={styles.panelTitle} id="checkout-payment-title">
              Pay {formatINR(shownTotals.totalPaise)}
            </h2>
            <p className={styles.panelNote}>
              Payment is taken inside Razorpay. The shop records the payment result and never sees
              your card number, CVV or expiry.
            </p>

            {sandbox ? (
              <div className={styles.sandbox}>
                <p className={styles.sandboxNote}>
                  Razorpay sandbox is on for this local run. Choose a test method; no real charge is
                  made.
                </p>
                <div className={styles.payButtons}>
                  <button
                    className={styles.payButton}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      void payInSandbox('upi');
                    }}
                  >
                    <Smartphone aria-hidden="true" size={18} strokeWidth={1.6} />
                    Pay by UPI (test)
                  </button>
                  <button
                    className={styles.payButton}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      void payInSandbox('card');
                    }}
                  >
                    <CreditCard aria-hidden="true" size={18} strokeWidth={1.6} />
                    Pay by card (test)
                  </button>
                </div>
                <button
                  className={styles.cancel}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    void cancelPayment();
                  }}
                >
                  Cancel payment
                </button>
              </div>
            ) : (
              <button
                className={styles.payButton}
                type="button"
                disabled={busy}
                onClick={() => {
                  void payWithRazorpay();
                }}
              >
                <Lock aria-hidden="true" size={18} strokeWidth={1.6} />
                Pay with Razorpay
              </button>
            )}

            {paymentMessage ? (
              <div
                className={
                  paymentState === 'failed' ? styles.paymentError : styles.paymentNote
                }
                role="alert"
              >
                <AlertCircle aria-hidden="true" size={18} strokeWidth={1.5} />
                <p>{paymentMessage}</p>
              </div>
            ) : null}

            <p className={styles.retryNote}>
              Changed your mind? <Link href="/cart">Review your cart</Link>. A cancelled payment
              leaves the cart exactly as it was.
            </p>
          </section>
        </div>
      ) : null}
    </div>
  );
}
