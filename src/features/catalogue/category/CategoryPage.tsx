import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProductGrid } from '@/components/ui/ProductGrid';
import type { Category, Product } from '@/server/catalogue/types';
import styles from './CategoryPage.module.css';

export interface CategoryPageProps {
  category: Category;
  products: Product[];
}

export function CategoryPage({ category, products }: CategoryPageProps) {
  const count = products.length;

  return (
    <div className={styles.page}>
      <nav className={styles.breadcrumb} aria-label="Breadcrumb">
        <Link className={styles.crumbLink} href="/">
          Shop
        </Link>
        <ChevronRight aria-hidden="true" size={14} strokeWidth={1.5} />
        <span className={styles.crumbCurrent} aria-current="page">
          {category.name}
        </span>
      </nav>

      <header className={styles.intro}>
        <div className={styles.introCopy}>
          <p className={styles.eyebrow}>Walk the aisles</p>
          <h1 className={styles.title}>{category.name}</h1>
          {category.description ? (
            <p className={styles.description}>{category.description}</p>
          ) : (
            <p className={styles.description}>
              Everything the shopkeeper has set out on this shelf, plainly priced in rupees.
            </p>
          )}
        </div>

        <aside className={styles.shelfNote} aria-label="This aisle">
          <p className={styles.noteLabel}>On this shelf</p>
          <p className={styles.noteCount}>
            {count} {count === 1 ? 'thing' : 'things'}
          </p>
          <p className={styles.noteFoot}>
            Only active stock is shown. The shelf is the stock, and the stock is kept true.
          </p>
        </aside>
      </header>

      <section className={styles.catalogue} aria-labelledby="category-title">
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle} id="category-title">
            {count === 0 ? 'This aisle is waiting' : 'Take a closer look'}
          </h2>
          <p className={styles.sectionNote}>
            {count === 0
              ? 'Nothing is out here yet.'
              : `${count === 1 ? 'One thing' : `${count} things`} from ${category.name}, each with its rupee tag.`}
          </p>
        </div>

        {count === 0 ? (
          <EmptyState
            title="Nothing in this aisle yet."
            message={`The shopkeeper has not put anything in ${category.name} yet. Other aisles are still open, and this one will fill up when fresh stock arrives.`}
            action={{ href: '/', label: 'See every aisle' }}
          />
        ) : (
          <ProductGrid products={products} label={`${category.name} products`} />
        )}
      </section>
    </div>
  );
}
