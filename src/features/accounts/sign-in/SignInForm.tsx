import styles from './SignInForm.module.css';

export interface SignInFormProps {
  error?: string;
  next?: string;
  email?: string;
}

export function SignInForm({ error, next = '/account', email }: SignInFormProps) {
  return (
    <form className={styles.form} action="/api/auth/sign-in" method="post">
      {error ? (
        <p className={styles.alert} role="alert">
          {error}
        </p>
      ) : null}

      <input type="hidden" name="next" value={next} />

      <label className={styles.field} htmlFor="sign-in-email">
        <span className={styles.label}>Email</span>
        <input
          className={styles.input}
          id="sign-in-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          defaultValue={email}
          required
        />
      </label>

      <label className={styles.field} htmlFor="sign-in-password">
        <span className={styles.label}>Password</span>
        <input
          className={styles.input}
          id="sign-in-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>

      <button className={styles.submit} type="submit">
        Sign in
      </button>

      <p className={styles.note}>
        Your session stays on this device until you sign out. We never show whether an email is
        registered.
      </p>
    </form>
  );
}
