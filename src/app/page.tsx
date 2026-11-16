import { listCategories, listProducts } from '@/server/catalogue/service';
import { getFeatureNavigation } from '@/server/features/registry';
import { AppShell } from '@/components/ui/AppShell';
import { PriceTag } from '@/components/ui/PriceTag';
import { ProductCard } from '@/components/ui/ProductCard';
import styles from './home.module.css';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [categories, products] = await Promise.all([listCategories(), listProducts()]);
  const featureNav = getFeatureNavigation('shop');
  const lowestPrice =
    products.length > 0 ? Math.min(...products.map((product) => product.pricePaise)) : 0;

  return (
    <AppShell categories={categories} featureNav={featureNav}>
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>The shop counter</p>
          <h1 className={styles.heroTitle} id="hero-title">
            Everyday things, honestly priced.
          </h1>
          <p className={styles.heroText}>
            Spices, steel, soap and paper from a shop that keeps its stock true. Browse the aisle,
            check the rupee tag, and take your time — there is no countdown here.
          </p>
          <div className={styles.heroRules}>
            <span>Prices in rupees</span>
            <span aria-hidden="true">·</span>
            <span>Stock from the shelf</span>
            <span aria-hidden="true">·</span>
            <span>One short checkout</span>
          </div>
        </div>

        <aside className={styles.counterNote} aria-label="At the counter today">
          <p className={styles.noteLabel}>At the counter today</p>
          <dl className={styles.noteList}>
            <div className={styles.noteRow}>
              <dt>Things on the shelf</dt>
              <dd>{products.length}</dd>
            </div>
            <div className={styles.noteRow}>
              <dt>Aisles open</dt>
              <dd>{categories.length}</dd>
            </div>
            <div className={styles.noteRow}>
              <dt>Lowest rupee tag</dt>
              <dd>{lowestPrice > 0 ? <PriceTag amountPaise={lowestPrice} size="sm" /> : '—'}</dd>
            </div>
          </dl>
          <p className={styles.noteFoot}>The shelf is the stock. If it is here, it is counted.</p>
        </aside>
      </section>

      <section className={styles.aisles} aria-labelledby="aisles-title">
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle} id="aisles-title">
            Walk the aisles
          </h2>
          <p className={styles.sectionNote}>Four corners of the shop, plainly kept.</p>
        </div>
        <div className={styles.aisleGrid}>
          {categories.map((category) => (
            <a className={styles.aisleCard} href={`/category/${category.slug}`} key={category.id}>
              <span className={styles.aisleCount}>{category.productCount}</span>
              <span className={styles.aisleName}>{category.name}</span>
              {category.description ? (
                <span className={styles.aisleText}>{category.description}</span>
              ) : null}
            </a>
          ))}
        </div>
      </section>

      <section className={styles.catalogue} aria-labelledby="catalogue-title">
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle} id="catalogue-title">
            On the shelf
          </h2>
          <p className={styles.sectionNote}>
            {products.length === 1 ? 'One thing' : `${products.length} things`} in the shop right
            now, each with its rupee tag.
          </p>
        </div>

        {products.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>The shelf is empty.</p>
            <p>The shopkeeper has not put anything out yet. Check back soon.</p>
          </div>
        ) : (
          <div className={styles.productGrid}>
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
