import Link from 'next/link';
import { PackageOpen } from 'lucide-react';
import styles from './EmptyState.module.css';

export interface EmptyStateAction {
  href: string;
  label: string;
}

export interface EmptyStateProps {
  title: string;
  message: string;
  action?: EmptyStateAction;
}

/**
 * A plain, honest empty shelf. It is a panel of words, never a grid with
 * missing pieces, so an empty category or search reads as a deliberate state.
 */
export function EmptyState({ title, message, action }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <PackageOpen className={styles.icon} aria-hidden="true" size={28} strokeWidth={1.5} />
      <div className={styles.copy}>
        <p className={styles.title}>{title}</p>
        <p className={styles.message}>{message}</p>
      </div>
      {action ? (
        <Link className={styles.action} href={action.href}>
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
