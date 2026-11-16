import type { Product } from '@/server/catalogue/types';
import { ProductCard } from './ProductCard';
import styles from './ProductGrid.module.css';

export interface ProductGridProps {
  products: Product[];
  label?: string;
}

/**
 * The shop's product grid. It shares one card component so home, category and
 * later catalogue screens show the same image, name and rupee tag.
 */
export function ProductGrid({ products, label }: ProductGridProps) {
  if (products.length === 0) {
    return null;
  }

  return (
    <div className={styles.grid} role="list" aria-label={label}>
      {products.map((product) => (
        <div className={styles.cell} role="listitem" key={product.id}>
          <ProductCard product={product} />
        </div>
      ))}
    </div>
  );
}
