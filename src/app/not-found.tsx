import Link from 'next/link';
import styles from './status.module.css';

export default function NotFound() {
  return (
    <main className={styles.wrap}>
      <p className={styles.eyebrow}>Nothing on this shelf</p>
      <h1 className={styles.title}>We could not find that page.</h1>
      <p className={styles.text}>
        The link may be old, or the shopkeeper may have moved the shelf. Everything currently in
        the shop is on the home page.
      </p>
      <Link className={styles.link} href="/">
        Back to the shop
      </Link>
    </main>
  );
}
