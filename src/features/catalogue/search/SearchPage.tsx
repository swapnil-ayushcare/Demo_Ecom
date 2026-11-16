import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { ProductCard } from '@/components/ui/ProductCard';
import type { Category, Product } from '@/server/catalogue/types';
import { ActiveFilters } from './ActiveFilters';
import { FilterPanel } from './FilterPanel';
import { SearchField } from './SearchField';
import { clearFiltersHref, type SearchFilterErrors, type SearchFilters } from './filters';
import styles from './SearchPage.module.css';

export interface SearchPageProps {
  filters: SearchFilters;
  errors: SearchFilterErrors;
  categories: Category[];
  products: Product[];
}

function resultCountLabel(count: number): string {
  if (count === 0) {
    return 'No products found';
  }
  return count === 1 ? '1 product found' : `${count} products found`;
}

function hasErrors(errors: SearchFilterErrors): boolean {
  return Object.values(errors).some(Boolean);
}

export function SearchPage({ filters, errors, categories, products }: SearchPageProps) {
  const invalid = hasErrors(errors);
  const narrowing =
    filters.category !== '' ||
    filters.minPaise !== null ||
    filters.maxPaise !== null ||
    filters.inStock;
  const count = products.length;

  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <p className={styles.eyebrow}>Search the shelves</p>
        <h1 className={styles.title}>
          {filters.q ? (
            <>
              Results for <span className={styles.phrase}>“{filters.q}”</span>
            </>
          ) : (
            'Find something on the shelf'
          )}
        </h1>
        <p className={styles.lede}>
          Search product names and descriptions, then narrow by aisle, rupee budget or what is
          in stock. Every choice stays in the address, so the same link shows the same shelf.
        </p>
        <SearchField filters={filters} />
      </header>

      <div className={styles.columns}>
        <aside className={styles.rail} aria-label="Search filters">
          <FilterPanel filters={filters} errors={errors} categories={categories} />
        </aside>

        <section className={styles.results} aria-labelledby="results-title">
          <div className={styles.resultsHead}>
            <h2 className={styles.resultsTitle} id="results-title">
              {narrowing ? 'Narrowed shelf' : filters.q ? 'Matching things' : 'Everything on the shelf'}
            </h2>
            <p className={styles.count} role="status" aria-live="polite">
              {invalid ? 'Check the filters above' : resultCountLabel(count)}
            </p>
          </div>

          <ActiveFilters filters={filters} categories={categories} />

          {invalid ? (
            <div className={styles.notice}>
              <p className={styles.noticeTitle}>Those filter values need another look.</p>
              <p>Correct the amounts above and apply the filters again.</p>
            </div>
          ) : count === 0 ? (
            <div className={styles.empty}>
              <SearchX className={styles.emptyIcon} aria-hidden="true" size={34} strokeWidth={1.5} />
              <p className={styles.emptyTitle}>
                {filters.q
                  ? `No products found for “${filters.q}”.`
                  : 'No products match these filters.'}
              </p>
              <p className={styles.emptyText}>
                Try a shorter phrase or a different word. The shelf only shows what the shopkeeper
                has put out, and the stock is kept true.
              </p>
              <div className={styles.emptyActions}>
                {narrowing ? (
                  <Link className={styles.emptyLink} href={clearFiltersHref(filters)}>
                    Clear the filters
                  </Link>
                ) : null}
                <Link className={styles.emptyLink} href="/">
                  Browse every aisle
                </Link>
              </div>
            </div>
          ) : (
            <div className={styles.grid}>
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
