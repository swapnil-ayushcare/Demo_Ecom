import { Search } from 'lucide-react';
import { rupeeInputValue, type SearchFilters } from './filters';
import styles from './SearchField.module.css';

export interface SearchFieldProps {
  filters: SearchFilters;
}

/**
 * The catalogue search box. Its hidden fields carry the current filters, so a
 * new phrase narrows the same shelf instead of throwing the filters away.
 */
export function SearchField({ filters }: SearchFieldProps) {
  return (
    <form
      className={styles.form}
      action="/search"
      method="get"
      role="search"
      aria-label="Search the catalogue"
    >
      {filters.category ? (
        <input type="hidden" name="category" value={filters.category} />
      ) : null}
      {filters.minPaise !== null ? (
        <input type="hidden" name="min" value={rupeeInputValue(filters.minPaise)} />
      ) : null}
      {filters.maxPaise !== null ? (
        <input type="hidden" name="max" value={rupeeInputValue(filters.maxPaise)} />
      ) : null}
      {filters.inStock ? <input type="hidden" name="inStock" value="1" /> : null}

      <Search className={styles.icon} aria-hidden="true" size={22} strokeWidth={1.5} />
      <label className={styles.srOnly} htmlFor="catalogue-search">
        Search products by name or description
      </label>
      <input
        id="catalogue-search"
        className={styles.input}
        type="search"
        name="q"
        defaultValue={filters.q}
        placeholder="Try “cotton”, “pepper”, “soap”…"
        autoComplete="off"
        enterKeyHint="search"
      />
      <button className={styles.button} type="submit">
        Search
      </button>
    </form>
  );
}
