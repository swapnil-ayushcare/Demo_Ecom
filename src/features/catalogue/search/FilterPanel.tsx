import Link from 'next/link';
import { SlidersHorizontal } from 'lucide-react';
import type { Category } from '@/server/catalogue/types';
import {
  clearFiltersHref,
  rupeeInputValue,
  type SearchFilterErrors,
  type SearchFilters,
} from './filters';
import styles from './FilterPanel.module.css';

export interface FilterPanelProps {
  filters: SearchFilters;
  errors: SearchFilterErrors;
  categories: Category[];
}

/**
 * Category, rupee range and availability, all submitted together with the
 * phrase. The form is plain GET so every applied filter is in the URL.
 */
export function FilterPanel({ filters, errors, categories }: FilterPanelProps) {
  return (
    <form
      className={styles.panel}
      action="/search"
      method="get"
      aria-labelledby="filters-title"
    >
      <input type="hidden" name="q" value={filters.q} />

      <div className={styles.heading}>
        <h2 className={styles.title} id="filters-title">
          <SlidersHorizontal aria-hidden="true" size={18} strokeWidth={1.5} />
          Filters
        </h2>
        <Link className={styles.clear} href={clearFiltersHref(filters)}>
          Clear filters
        </Link>
      </div>

      <div className={styles.group}>
        <label className={styles.label} htmlFor="filter-category">
          Category
        </label>
        <select
          className={styles.select}
          id="filter-category"
          name="category"
          defaultValue={filters.category}
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.slug}>
              {category.name} ({category.productCount})
            </option>
          ))}
        </select>
        {errors.category ? (
          <p className={styles.error} role="alert">
            {errors.category}
          </p>
        ) : null}
      </div>

      <fieldset className={styles.group}>
        <legend className={styles.label}>Price in rupees</legend>
        <div className={styles.priceRow}>
          <label className={styles.priceField}>
            <span>Minimum</span>
            <span className={styles.amount}>
              <span className={styles.rupee} aria-hidden="true">
                ₹
              </span>
              <input
                className={styles.input}
                type="number"
                name="min"
                min="0"
                step="1"
                inputMode="numeric"
                placeholder="0"
                defaultValue={
                  filters.minPaise !== null ? rupeeInputValue(filters.minPaise) : ''
                }
              />
            </span>
          </label>
          <label className={styles.priceField}>
            <span>Maximum</span>
            <span className={styles.amount}>
              <span className={styles.rupee} aria-hidden="true">
                ₹
              </span>
              <input
                className={styles.input}
                type="number"
                name="max"
                min="0"
                step="1"
                inputMode="numeric"
                placeholder="Any"
                defaultValue={
                  filters.maxPaise !== null ? rupeeInputValue(filters.maxPaise) : ''
                }
              />
            </span>
          </label>
        </div>
        {errors.min ? (
          <p className={styles.error} role="alert">
            {errors.min}
          </p>
        ) : null}
        {errors.max ? (
          <p className={styles.error} role="alert">
            {errors.max}
          </p>
        ) : null}
      </fieldset>

      <label className={styles.checkRow}>
        <input
          className={styles.checkbox}
          type="checkbox"
          name="inStock"
          value="1"
          defaultChecked={filters.inStock}
        />
        <span>In stock only</span>
      </label>

      <button className={styles.submit} type="submit">
        Apply filters
      </button>
    </form>
  );
}
