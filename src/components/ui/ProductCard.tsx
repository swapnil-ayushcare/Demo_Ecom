import Link from 'next/link';
import type { Product } from '@/server/catalogue/types';
import { PriceTag } from './PriceTag';
import { AddToCartButton } from '@/features/cart/AddToCartButton';
import styles from './ProductCard.module.css';

function stockLabel(product: Product): string {
  if (!product.inStock) {
    return 'Out of stock';
  }
  if (product.stockQuantity <= 5) {
    return `Only ${product.stockQuantity} left`;
  }
  return 'In stock';
}

export function ProductCard({ product }: { product: Product }) {
  const image = product.images[0];
  const stockClass = !product.inStock
    ? styles.stockOut
    : product.stockQuantity <= 5
      ? styles.stockLow
      : styles.stockIn;

  return (
    <article className={styles.card}>
      <Link className={styles.imageLink} href={`/products/${product.slug}`} tabIndex={-1} aria-hidden="true">
        {image ? (
          <img
            className={styles.image}
            src={image.url}
            alt=""
            width={600}
            height={600}
            loading="lazy"
          />
        ) : (
          <span className={styles.imageFallback}>No photo yet</span>
        )}
      </Link>

      <div className={styles.body}>
        <p className={styles.category}>{product.category.name}</p>
        <h3 className={styles.name}>
          <Link href={`/products/${product.slug}`}>{product.name}</Link>
        </h3>
        <div className={styles.priceRow}>
          <PriceTag amountPaise={product.pricePaise} size="sm" label={product.name} />
          <span className={`${styles.stock} ${stockClass}`}>{stockLabel(product)}</span>
        </div>
        <AddToCartButton
          productId={product.id}
          name={product.name}
          inStock={product.inStock}
        />
      </div>
    </article>
  );
}
