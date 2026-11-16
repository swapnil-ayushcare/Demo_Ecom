'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import styles from './status.module.css';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className={styles.wrap}>
      <p className={styles.eyebrow}>The counter hit a snag</p>
      <h1 className={styles.title}>Something went wrong behind the counter.</h1>
      <p className={styles.text}>
        The shop could not finish that request. Try again, or go back to the shelf and start from
        there.
      </p>
      <button className={styles.link} type="button" onClick={reset}>
        Try again
      </button>
      <p>
        <Link href="/">Back to the shop</Link>
      </p>
    </main>
  );
}
