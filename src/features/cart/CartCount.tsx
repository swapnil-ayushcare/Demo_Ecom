import { getCurrentCart } from './currentCart';
import styles from './CartCount.module.css';

/**
 * The header's cart count, read on the server so the number is the same one
 * the cart page will show.
 */
export async function CartCount() {
  let count = 0;
  try {
    const { cart } = await getCurrentCart();
    count = cart.itemCount;
  } catch (error) {
    console.error(
      'Could not read the cart count:',
      error instanceof Error ? error.message : String(error),
    );
  }

  if (count < 1) {
    return null;
  }

  return (
    <span
      className={styles.badge}
      data-testid="cart-count"
      aria-label={`${count} ${count === 1 ? 'item' : 'items'} in cart`}
    >
      {count}
    </span>
  );
}
