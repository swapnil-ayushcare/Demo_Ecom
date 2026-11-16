import { Minus, Plus, Trash2 } from 'lucide-react';
import { PriceTag } from '@/components/ui/PriceTag';
import { formatINR } from '@/lib/money';
import { MAX_CART_LINE_QUANTITY, type CartLine as CartLineModel } from './types';
import styles from './CartLine.module.css';

export interface CartLineProps {
  line: CartLineModel;
  pending?: boolean;
  onQuantityChange: (line: CartLineModel, quantity: number) => void;
  onRemove: (line: CartLineModel) => void;
}

export function CartLine({ line, pending = false, onQuantityChange, onRemove }: CartLineProps) {
  const ceiling = Math.min(line.stockQuantity, MAX_CART_LINE_QUANTITY);
  const atCeiling = line.quantity >= ceiling;

  return (
    <li className={styles.line} data-testid="cart-line">
      <div className={styles.thumb}>
        {line.imageUrl ? (
          <img className={styles.image} src={line.imageUrl} alt="" width={144} height={144} />
        ) : (
          <span className={styles.thumbFallback}>No photo</span>
        )}
      </div>

      <div className={styles.body}>
        <p className={styles.name}>{line.name}</p>
        <p className={styles.unit}>{formatINR(line.unitPricePaise)} each</p>
      </div>

      <div className={styles.quantity}>
        <span className={styles.qtyLabel}>Qty</span>
        <div className={styles.stepper}>
          <button
            className={styles.stepButton}
            type="button"
            aria-label={`Decrease quantity of ${line.name}`}
            disabled={pending || line.quantity <= 1}
            onClick={() => onQuantityChange(line, line.quantity - 1)}
          >
            <Minus aria-hidden="true" size={16} strokeWidth={1.8} />
          </button>
          <span className={styles.qty} data-testid="cart-line-quantity" aria-live="polite">
            {line.quantity}
          </span>
          <button
            className={styles.stepButton}
            type="button"
            aria-label={`Increase quantity of ${line.name}`}
            disabled={pending || atCeiling}
            onClick={() => onQuantityChange(line, line.quantity + 1)}
          >
            <Plus aria-hidden="true" size={16} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      <div className={styles.total} data-testid="cart-line-total">
        <span className={styles.lineTotalLabel}>Line total</span>
        <PriceTag amountPaise={line.lineTotalPaise} size="sm" label={`Line total for ${line.name}`} />
      </div>

      <button
        className={styles.remove}
        type="button"
        aria-label={`Remove ${line.name} from cart`}
        disabled={pending}
        onClick={() => onRemove(line)}
      >
        <Trash2 aria-hidden="true" size={18} strokeWidth={1.6} />
      </button>
    </li>
  );
}
