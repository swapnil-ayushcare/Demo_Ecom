'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Minus, Plus, ShoppingBag } from 'lucide-react';
import styles from './AddToCartButton.module.css';

type Status = 'idle' | 'pending' | 'added' | 'error';

const MAX_LINE_QUANTITY = 99;

export interface AddToCartButtonProps {
  productId: string;
  name: string;
  inStock: boolean;
  stockQuantity: number;
}

function clampQuantity(value: number, max: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.min(Math.max(Math.trunc(value), 1), max);
}

export function AddToCartButton({
  productId,
  name,
  inStock,
  stockQuantity,
}: AddToCartButtonProps) {
  const router = useRouter();
  const maxQuantity = Math.max(1, Math.min(stockQuantity, MAX_LINE_QUANTITY));
  const [quantity, setQuantity] = useState(1);
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');

  const busy = status === 'pending';
  const controlsDisabled = !inStock || busy;

  function changeQuantity(next: number): void {
    setQuantity(clampQuantity(next, maxQuantity));
    if (status !== 'idle') {
      setStatus('idle');
      setMessage('');
    }
  }

  async function addToCart(): Promise<void> {
    if (!inStock || busy) {
      return;
    }

    setStatus('pending');
    setMessage('');

    try {
      const response = await fetch('/api/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, quantity }),
      });
      const body = (await response.json().catch(() => null)) as
        | { message?: string; fieldErrors?: Record<string, string> }
        | null;

      if (!response.ok) {
        setStatus('error');
        setMessage(
          body?.fieldErrors?.quantity ??
            body?.message ??
            'We could not add that to your cart. Try again.',
        );
        return;
      }

      setStatus('added');
      router.refresh();
    } catch {
      setStatus('error');
      setMessage('We could not reach the shop. Check your connection and try again.');
    }
  }

  const addLabel = !inStock
    ? 'Out of stock'
    : busy
      ? 'Adding…'
      : status === 'added'
        ? 'Added to cart'
        : 'Add to cart';

  return (
    <div className={styles.purchase}>
      <div className={styles.quantityRow}>
        <span className={styles.quantityLabel} id={`quantity-label-${productId}`}>
          Quantity
        </span>
        <div className={styles.stepper}>
          <button
            type="button"
            className={styles.stepButton}
            aria-label="Decrease quantity"
            disabled={controlsDisabled || quantity <= 1}
            onClick={() => changeQuantity(quantity - 1)}
          >
            <Minus aria-hidden="true" size={17} strokeWidth={2} />
          </button>
          <input
            className={styles.quantityInput}
            type="number"
            inputMode="numeric"
            min={1}
            max={maxQuantity}
            step={1}
            value={quantity}
            aria-labelledby={`quantity-label-${productId}`}
            disabled={controlsDisabled}
            onChange={(event) => changeQuantity(Number(event.target.value))}
          />
          <button
            type="button"
            className={styles.stepButton}
            aria-label="Increase quantity"
            disabled={controlsDisabled || quantity >= maxQuantity}
            onClick={() => changeQuantity(quantity + 1)}
          >
            <Plus aria-hidden="true" size={17} strokeWidth={2} />
          </button>
        </div>
      </div>

      <button
        type="button"
        className={styles.addButton}
        disabled={!inStock || busy}
        aria-label={inStock ? `Add ${name} to cart` : `${name} is out of stock`}
        onClick={addToCart}
      >
        {status === 'added' ? (
          <Check aria-hidden="true" size={19} strokeWidth={1.8} />
        ) : (
          <ShoppingBag aria-hidden="true" size={19} strokeWidth={1.6} />
        )}
        <span>{addLabel}</span>
      </button>

      {!inStock ? (
        <p className={styles.help}>
          This one is off the shelf for now. The page will say when it is back.
        </p>
      ) : (
        <p className={styles.help}>
          {stockQuantity <= 5
            ? `Only ${stockQuantity} left on the shelf.`
            : 'Stock is counted from the shelf, not promised.'}
        </p>
      )}

      {status === 'added' ? (
        <p className={styles.status} role="status">
          {quantity > 1 ? `${quantity} added to your cart.` : 'Added to your cart.'}
        </p>
      ) : null}

      {status === 'error' && message ? (
        <p className={styles.error} role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
