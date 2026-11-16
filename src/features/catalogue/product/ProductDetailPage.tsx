import Link from 'next/link';
import { ChevronRight, PackageCheck, PackageX } from 'lucide-react';
import { PriceTag } from '@/components/ui/PriceTag';
import type { Product } from '@/server/catalogue/types';
import { AddToCartButton } from './AddToCartButton';
import { ProductGallery } from './ProductGallery';
import styles from './ProductDetailPage.module.css';

function stockLabel(product: Product): string {
  if (!product.inStock) {
    return 'Out of stock';
  }
  if (product.stockQuantity <= 5) {
    return `Only ${product.stockQuantity} left`;
  }
  return 'In stock';
}

export function ProductDetailPage({ product }: { product: Product }) {
  const stock = stockLabel(product);

  return (
    <article className={styles.page}>
      <nav className={styles.breadcrumb} aria-label="Breadcrumb">
        <ol>
          <li>
            <Link href="/">Shop home</Link>
          </li>
          <li aria-hidden="true">
            <ChevronRight size={14} strokeWidth={1.8} />
          </li>
          <li>
            <Link href={`/category/${product.category.slug}`}>{product.category.name}</Link>
          </li>
          <li aria-hidden="true">
            <ChevronRight size={14} strokeWidth={1.8} />
          </li>
          <li aria-current="page">{product.name}</li>
        </ol>
      </nav>

      <div className={styles.layout}>
        <div className={styles.galleryColumn}>
          <ProductGallery images={product.images} name={product.name} />
        </div>

        <section className={styles.buyPanel} aria-labelledby="product-name" data-testid="buy-panel">
          <p className={styles.category}>
            <Link href={`/category/${product.category.slug}`} data-testid="product-category">
              {product.category.name}
            </Link>
          </p>

          <h1 className={styles.name} id="product-name">
            {product.name}
          </h1>

          <div className={styles.priceRow}>
            <PriceTag amountPaise={product.pricePaise} size="lg" label={product.name} />
            <span
              className={[styles.stock, product.inStock ? styles.stockIn : styles.stockOut]
                .filter(Boolean)
                .join(' ')}
              data-testid="product-stock"
            >
              {product.inStock ? (
                <PackageCheck aria-hidden="true" size={17} strokeWidth={1.8} />
              ) : (
                <PackageX aria-hidden="true" size={17} strokeWidth={1.8} />
              )}
              {stock}
            </span>
          </div>

          <div className={styles.description}>
            <p>{product.description}</p>
          </div>

          <AddToCartButton
            productId={product.id}
            name={product.name}
            inStock={product.inStock}
            stockQuantity={product.stockQuantity}
          />

          <p className={styles.finePrint}>
            Prices are in Indian rupees (INR). Razorpay takes the payment at checkout; the shop
            never sees your card.
          </p>
        </section>
      </div>
    </article>
  );
}
