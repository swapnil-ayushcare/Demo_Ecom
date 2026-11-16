import Link from 'next/link';
import { Search, ShoppingBag } from 'lucide-react';
import type { Category } from '@/server/catalogue/types';
import type { FeatureNavigationDefinition } from '@/server/features/registry';
import { SignUpNav } from '@/features/accounts/sign-up/SignUpNav';
import { CartCount } from '@/features/cart/CartCount';
import { CategoryRail } from './CategoryRail';
import styles from './SiteHeader.module.css';

export interface SiteHeaderProps {
  categories: Category[];
  featureNav?: Array<FeatureNavigationDefinition & { area: 'shop' | 'admin'; order: number }>;
  activeCategory?: string;
}

export function SiteHeader({ categories, featureNav, activeCategory }: SiteHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.topBar}>
        <Link className={styles.wordmark} href="/" aria-label="Demo_Ecom home">
          <span className={styles.wordmarkName}>Demo_Ecom</span>
          <span className={styles.wordmarkTagline}>a small, honest shop</span>
        </Link>

        <form className={styles.search} action="/search" method="get" role="search">
          <Search className={styles.searchIcon} aria-hidden="true" size={20} strokeWidth={1.5} />
          <label className={styles.srOnly} htmlFor="site-search">
            Search the shop
          </label>
          <input
            id="site-search"
            className={styles.searchInput}
            type="search"
            name="q"
            placeholder="Search spice, steel, soap…"
            autoComplete="off"
          />
          <button className={styles.searchButton} type="submit">
            Search
          </button>
        </form>

        <nav className={styles.actions} aria-label="Account and cart">
          <SignUpNav />
          <Link className={styles.action} href="/cart">
            <ShoppingBag aria-hidden="true" size={20} strokeWidth={1.5} />
            <span className={styles.actionLabel}>Cart</span>
            <CartCount />
          </Link>
        </nav>
      </div>

      <CategoryRail
        categories={categories}
        featureNav={featureNav}
        activeCategory={activeCategory}
      />
    </header>
  );
}
