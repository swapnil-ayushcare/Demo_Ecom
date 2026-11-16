import type { Category } from '@/server/catalogue/types';
import type { FeatureNavigationDefinition } from '@/server/features/registry';
import { SiteHeader } from '@/components/shop/SiteHeader';
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

      <SiteHeader
        categories={categories}
        featureNav={featureNav}
        activeCategory={activeCategory}
      />

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
