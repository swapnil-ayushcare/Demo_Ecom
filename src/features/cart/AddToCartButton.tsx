'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ShoppingBag } from 'lucide-react';
import styles from './AddToCartButton.module.css';

type Status = 'idle' | 'pending' | 'added' | 'error';

export interface AddToCartButtonProps {
  productId: string;
  name: string;
  inStock: boolean;
  quantity?: number;
}

export function AddToCartButton({
  productId,
  name,
  inStock,
  quantity = 1,
}: AddToCartButtonProps) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');

  async function addToCart(): Promise<void> {
    if (!inStock || status === 'pending') {
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

  const label = !inStock
    ? 'Out of stock'
    : status === 'pending'
      ? 'Adding…'
      : status === 'added'
        ? 'Added to cart'
        : 'Add to cart';

  return (
    <div className={styles.wrap}>
      <button
        className={styles.button}
        type="button"
        aria-label={`Add ${name} to cart`}
        disabled={!inStock || status === 'pending'}
        onClick={addToCart}
      >
        {status === 'added' ? (
          <Check aria-hidden="true" size={18} strokeWidth={1.8} />
        ) : (
          <ShoppingBag aria-hidden="true" size={18} strokeWidth={1.6} />
        )}
        <span>{label}</span>
      </button>
      {status === 'error' && message ? (
        <p className={styles.message} role="status">
          {message}
        </p>
      ) : null}
      {status === 'added' ? (
        <p className={styles.status} role="status">
          {quantity > 1 ? `${quantity} in your cart` : 'In your cart'}
        </p>
      ) : null}
    </div>
  );
}
