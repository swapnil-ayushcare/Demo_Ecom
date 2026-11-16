'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, ShoppingBag } from 'lucide-react';
import { CartLine } from './CartLine';
import { CartSummary } from './CartSummary';
import type { Cart, CartLine as CartLineModel } from './types';
import styles from './CartView.module.css';

interface CartResponse {
  cart?: Cart;
  message?: string;
}

export function CartView({ initialCart }: { initialCart: Cart }) {
  const router = useRouter();
  const [cart, setCart] = useState<Cart>(initialCart);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(
    line: CartLineModel,
    url: string,
    init: { method: 'PATCH' | 'DELETE'; body?: string },
  ): Promise<void> {
    setPendingId(line.id);
    setError(null);

    try {
      const response = await fetch(url, {
        method: init.method,
        headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
        body: init.body,
      });
      const body = (await response.json().catch(() => null)) as CartResponse | null;

      if (!response.ok || !body?.cart) {
        setError(body?.message ?? 'We could not update your cart. Try again.');
        return;
      }

      setCart(body.cart);
      router.refresh();
    } catch {
      setError('We could not reach the shop. Check your connection and try again.');
    } finally {
      setPendingId(null);
    }
  }

  function changeQuantity(line: CartLineModel, quantity: number): void {
    if (quantity < 1) {
      return;
    }
    void send(line, `/api/cart/items/${line.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity }),
    });
  }

  function removeLine(line: CartLineModel): void {
    void send(line, `/api/cart/items/${line.id}`, { method: 'DELETE' });
  }

  return (
    <div className={styles.layout}>
      <div className={styles.linesColumn}>
        {error ? (
          <div className={styles.error} role="alert">
            <AlertCircle aria-hidden="true" size={20} strokeWidth={1.5} />
            <p>{error}</p>
          </div>
        ) : null}

        {cart.lines.length === 0 ? (
          <div className={styles.empty} data-testid="cart-empty">
            <span className={styles.emptyIcon} aria-hidden="true">
              <ShoppingBag size={30} strokeWidth={1.4} />
            </span>
            <p className={styles.emptyTitle}>Your cart is empty.</p>
            <p className={styles.emptyText}>
              Nothing has been picked up yet. Walk the aisles and add what you need — the rupee
              tags will add up here.
            </p>
            <Link className={styles.emptyLink} href="/">
              Browse the shop
            </Link>
          </div>
        ) : (
          <ul className={styles.lines}>
            {cart.lines.map((line) => (
              <CartLine
                key={line.id}
                line={line}
                pending={pendingId === line.id}
                onQuantityChange={changeQuantity}
                onRemove={removeLine}
              />
            ))}
          </ul>
        )}
      </div>

      {cart.lines.length > 0 ? <CartSummary cart={cart} /> : null}
    </div>
  );
}
