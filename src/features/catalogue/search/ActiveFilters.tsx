import Link from 'next/link';
import { X } from 'lucide-react';
import type { Category } from '@/server/catalogue/types';
import {
  activeFilters,
  clearFiltersHref,
  type SearchFilters,
} from './filters';
import styles from './ActiveFilters.module.css';

export interface ActiveFiltersProps {
  filters: SearchFilters;
  categories: Category[];
}

/**
 * What is currently narrowing the shelf. Each tag removes only itself; the
 * clear link removes them all. Both keep the search phrase.
 */
export function ActiveFilters({ filters, categories }: ActiveFiltersProps) {
  const filtersOn = activeFilters(filters, categories);

  return (
    <section className={styles.wrap} aria-label="Active filters">
      <div className={styles.lead}>
        <h2 className={styles.title}>Active filters</h2>
        {filtersOn.length > 0 ? (
          <Link className={styles.clear} href={clearFiltersHref(filters)}>
            Clear all
          </Link>
        ) : null}
      </div>

      {filtersOn.length === 0 ? (
        <p className={styles.none}>No filters applied — the whole shelf is showing.</p>
      ) : (
        <ul className={styles.list}>
          {filtersOn.map((filter) => (
            <li key={filter.key}>
              <Link
                className={styles.chip}
                href={filter.href}
                aria-label={`Remove filter: ${filter.label}`}
              >
                <span>{filter.label}</span>
                <X className={styles.icon} aria-hidden="true" size={14} strokeWidth={2} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
