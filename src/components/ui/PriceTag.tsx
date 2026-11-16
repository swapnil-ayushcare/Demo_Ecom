import { formatINR } from '@/lib/money';
import styles from './PriceTag.module.css';

export interface PriceTagProps {
  amountPaise: number;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  className?: string;
}

/**
 * The rupee tag: the shop's one memorable motif, used only where a price is
 * being stated. The amount is always integer paise and the display is INR.
 */
export function PriceTag({ amountPaise, size = 'md', label, className }: PriceTagProps) {
  const display = formatINR(amountPaise);
  return (
    <span
      className={[styles.tag, styles[size], className].filter(Boolean).join(' ')}
      aria-label={label ? `${label}: ${display}` : undefined}
    >
      <span className={styles.hole} aria-hidden="true" />
      <span className={styles.amount}>{display}</span>
      <span className={styles.currency} aria-hidden="true">
        INR
      </span>
    </span>
  );
}
