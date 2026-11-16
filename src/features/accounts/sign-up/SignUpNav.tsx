import Link from 'next/link';
import { UserPlus, UserRound } from 'lucide-react';
import { getCurrentUser } from './current-user';
import styles from './SignUpNav.module.css';

function firstName(name: string): string {
  const [first] = name.trim().split(/\s+/);
  return first || name;
}

/**
 * Header session state. A signed-out shopper is invited to open an account; a
 * signed-in shopper sees the name the shop recognises them by.
 */
export async function SignUpNav() {
  const user = await getCurrentUser();

  if (user) {
    return (
      <Link
        className={styles.greeting}
        href="/account"
        aria-label={`Signed in as ${user.name}. Open your account`}
      >
        <UserRound aria-hidden="true" size={20} strokeWidth={1.5} />
        <span className={styles.greetingText}>Hi, {firstName(user.name)}</span>
      </Link>
    );
  }

  return (
    <>
      <Link className={styles.action} href="/sign-up">
        <UserPlus aria-hidden="true" size={20} strokeWidth={1.5} />
        <span>Sign up</span>
      </Link>
      <Link className={styles.action} href="/account">
        <UserRound aria-hidden="true" size={20} strokeWidth={1.5} />
        <span>Account</span>
      </Link>
    </>
  );
}
