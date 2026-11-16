import Link from 'next/link';
import { Search, ShoppingBag } from 'lucide-react';
import type { Category } from '@/server/catalogue/types';
import type { FeatureNavigationDefinition } from '@/server/features/registry';
import { SignUpNav } from '@/features/accounts/sign-up/SignUpNav';
import { CartCount } from '@/features/cart/CartCount';
import styles from './AppShell.module.css';

export interface AppShellProps {
  categories: Category[];
  featureNav?: Array<FeatureNavigationDefinition & { area: 'shop' | 'admin'; order: number }>;
  activeCategory?: string;
  children: React.ReactNode;
}

export function AppShell({
  categories,
  featureNav = [],
  activeCategory,
  children,
}: AppShellProps) {
  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#main">
        Skip to content
      </a>

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

        <nav className={styles.categoryRail} aria-label="Product categories">
          <Link
            className={`${styles.categoryLink} ${!activeCategory ? styles.categoryActive : ''}`}
            href="/"
          >
            Everything
          </Link>
          {categories.map((category) => (
            <Link
              key={category.id}
              className={`${styles.categoryLink} ${
                activeCategory === category.slug ? styles.categoryActive : ''
              }`}
              href={`/category/${category.slug}`}
            >
              {category.name}
              <span className={styles.categoryCount}>{category.productCount}</span>
            </Link>
          ))}
          {featureNav.map((item) => (
            <Link key={`${item.href}-${item.label}`} className={styles.categoryLink} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className={styles.main} id="main">
        {children}
      </main>

      <footer className={styles.footer}>
        <p className={styles.footerLine}>
          <strong>Demo_Ecom</strong> · Prices in Indian rupees (INR) · Runs on your own machine
        </p>
        <p className={styles.footerNote}>
          Stock comes from the shelf, not a promise. Payments are taken by Razorpay; the shop never
          sees your card.
        </p>
      </footer>
    </div>
  );
}
