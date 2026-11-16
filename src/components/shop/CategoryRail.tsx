import Link from 'next/link';
import type { Category } from '@/server/catalogue/types';
import type { FeatureNavigationDefinition } from '@/server/features/registry';
import styles from './CategoryRail.module.css';

export interface CategoryRailProps {
  categories: Category[];
  featureNav?: Array<FeatureNavigationDefinition & { area: 'shop' | 'admin'; order: number }>;
  activeCategory?: string;
}

export function CategoryRail({ categories, featureNav = [], activeCategory }: CategoryRailProps) {
  return (
    <nav className={styles.rail} aria-label="Product categories">
      <Link
        className={`${styles.link} ${!activeCategory ? styles.active : ''}`}
        href="/"
        aria-current={!activeCategory ? 'page' : undefined}
      >
        Everything
      </Link>
      {categories.map((category) => (
        <Link
          key={category.id}
          className={`${styles.link} ${activeCategory === category.slug ? styles.active : ''}`}
          href={`/category/${category.slug}`}
          aria-current={activeCategory === category.slug ? 'page' : undefined}
        >
          {category.name}
          <span className={styles.count}>{category.productCount}</span>
        </Link>
      ))}
      {featureNav.map((item) => (
        <Link key={`${item.href}-${item.label}`} className={styles.link} href={item.href}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
