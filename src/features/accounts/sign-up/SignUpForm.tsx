'use client';

import { useRef, useState, type FormEvent } from 'react';
import { AlertCircle } from 'lucide-react';
import styles from './SignUpForm.module.css';

type FieldName = 'name' | 'email' | 'password';
type FieldErrors = Partial<Record<FieldName, string>>;

interface SignUpResponse {
  message?: string;
  fieldErrors?: FieldErrors;
}

export function SignUpForm() {
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFormError(null);
    setFieldErrors({});

    const data = new FormData(event.currentTarget);
    const payload = {
      name: String(data.get('name') ?? ''),
      email: String(data.get('email') ?? ''),
      password: String(data.get('password') ?? ''),
    };

    try {
      const response = await fetch('/api/accounts/sign-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        window.location.assign('/');
        return;
      }

      const body = (await response.json().catch(() => null)) as SignUpResponse | null;
      const errors = body?.fieldErrors ?? {};
      setFieldErrors(errors);
      setFormError(body?.message ?? 'We could not create your account. Try again.');

      if (errors.name) {
        nameRef.current?.focus();
      } else if (errors.email) {
        emailRef.current?.focus();
      } else if (errors.password) {
        passwordRef.current?.focus();
      }
    } catch {
      setFormError('We could not reach the shop. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      {formError ? (
        <div className={styles.formError} role="alert">
          <AlertCircle aria-hidden="true" size={20} strokeWidth={1.5} />
          <p>{formError}</p>
        </div>
      ) : null}

      <div className={styles.field}>
        <label className={styles.label} htmlFor="sign-up-name">
          Name
        </label>
        <input
          ref={nameRef}
          className={`${styles.input} ${fieldErrors.name ? styles.inputError : ''}`}
          id="sign-up-name"
          name="name"
          type="text"
          autoComplete="name"
          placeholder="Asha Rao"
          aria-invalid={fieldErrors.name ? true : undefined}
          aria-describedby={
            fieldErrors.name ? 'sign-up-name-help sign-up-name-error' : 'sign-up-name-help'
          }
        />
        <p className={styles.help} id="sign-up-name-help">
          The name the shopkeeper will use when you call.
        </p>
        {fieldErrors.name ? (
          <p className={styles.error} id="sign-up-name-error">
            <AlertCircle aria-hidden="true" size={16} strokeWidth={1.5} />
            {fieldErrors.name}
          </p>
        ) : null}
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="sign-up-email">
          Email
        </label>
        <input
          ref={emailRef}
          className={`${styles.input} ${fieldErrors.email ? styles.inputError : ''}`}
          id="sign-up-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="asha@example.com"
          aria-invalid={fieldErrors.email ? true : undefined}
          aria-describedby={
            fieldErrors.email ? 'sign-up-email-help sign-up-email-error' : 'sign-up-email-help'
          }
        />
        <p className={styles.help} id="sign-up-email-help">
          Your orders and updates will live under this address.
        </p>
        {fieldErrors.email ? (
          <p className={styles.error} id="sign-up-email-error">
            <AlertCircle aria-hidden="true" size={16} strokeWidth={1.5} />
            {fieldErrors.email}
          </p>
        ) : null}
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="sign-up-password">
          Password
        </label>
        <input
          ref={passwordRef}
          className={`${styles.input} ${fieldErrors.password ? styles.inputError : ''}`}
          id="sign-up-password"
          name="password"
          type="password"
          autoComplete="new-password"
          aria-invalid={fieldErrors.password ? true : undefined}
          aria-describedby={
            fieldErrors.password
              ? 'sign-up-password-help sign-up-password-error'
              : 'sign-up-password-help'
          }
        />
        <p className={styles.help} id="sign-up-password-help">
          At least 8 characters. The shop keeps only a slow hash, never your password.
        </p>
        {fieldErrors.password ? (
          <p className={styles.error} id="sign-up-password-error">
            <AlertCircle aria-hidden="true" size={16} strokeWidth={1.5} />
            {fieldErrors.password}
          </p>
        ) : null}
      </div>

      <button className={styles.submit} type="submit" disabled={pending}>
        {pending ? 'Opening your account…' : 'Create account'}
      </button>
    </form>
  );
}
