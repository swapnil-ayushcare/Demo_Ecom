'use client';

import { AlertCircle } from 'lucide-react';
import type { AddressFieldErrors, DeliveryAddress } from './types';
import styles from './AddressForm.module.css';

export interface AddressFormProps {
  values: DeliveryAddress;
  fieldErrors: AddressFieldErrors;
  formError: string | null;
  pending: boolean;
  onChange: (values: DeliveryAddress) => void;
  onSubmit: () => void;
}

interface FieldProps {
  id: string;
  name: keyof DeliveryAddress;
  label: string;
  value: string;
  error?: string;
  help?: string;
  autoComplete: string;
  inputMode?: 'text' | 'tel' | 'numeric';
  type?: 'text' | 'tel';
  required?: boolean;
  onChange: (name: keyof DeliveryAddress, value: string) => void;
}

function Field({
  id,
  name,
  label,
  value,
  error,
  help,
  autoComplete,
  inputMode,
  type = 'text',
  required = true,
  onChange,
}: FieldProps) {
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
        {!required ? <span className={styles.optional}> (optional)</span> : null}
      </label>
      <input
        className={`${styles.input} ${error ? styles.inputError : ''}`}
        id={id}
        name={name}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        value={value}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={[helpId, errorId].filter(Boolean).join(' ') || undefined}
        onChange={(event) => onChange(name, event.target.value)}
      />
      {help ? (
        <p className={styles.help} id={helpId}>
          {help}
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} id={errorId}>
          <AlertCircle aria-hidden="true" size={16} strokeWidth={1.5} />
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function AddressForm({
  values,
  fieldErrors,
  formError,
  pending,
  onChange,
  onSubmit,
}: AddressFormProps) {
  function update(name: keyof DeliveryAddress, value: string): void {
    onChange({ ...values, [name]: value });
  }

  return (
    <form
      className={styles.form}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {formError ? (
        <div className={styles.formError} role="alert">
          <AlertCircle aria-hidden="true" size={20} strokeWidth={1.5} />
          <p>{formError}</p>
        </div>
      ) : null}

      <Field
        id="checkout-name"
        name="name"
        label="Full name"
        value={values.name}
        error={fieldErrors.name}
        autoComplete="name"
        help="The name the delivery person should ask for."
        onChange={update}
      />

      <Field
        id="checkout-phone"
        name="phone"
        label="Phone number"
        value={values.phone}
        error={fieldErrors.phone}
        autoComplete="tel"
        inputMode="tel"
        type="tel"
        help="A 10-digit mobile number the shop can call about this delivery."
        onChange={update}
      />

      <Field
        id="checkout-line1"
        name="line1"
        label="Address line 1"
        value={values.line1}
        error={fieldErrors.line1}
        autoComplete="address-line1"
        help="House or building number, street and area."
        onChange={update}
      />

      <Field
        id="checkout-line2"
        name="line2"
        label="Address line 2"
        value={values.line2}
        error={fieldErrors.line2}
        autoComplete="address-line2"
        required={false}
        help="Landmark, apartment or anything that helps the delivery."
        onChange={update}
      />

      <div className={styles.row}>
        <Field
          id="checkout-city"
          name="city"
          label="City or town"
          value={values.city}
          error={fieldErrors.city}
          autoComplete="address-level2"
          onChange={update}
        />
        <Field
          id="checkout-state"
          name="state"
          label="State"
          value={values.state}
          error={fieldErrors.state}
          autoComplete="address-level1"
          onChange={update}
        />
      </div>

      <div className={styles.pincodeField}>
        <Field
          id="checkout-pincode"
          name="pincode"
          label="PIN code"
          value={values.pincode}
          error={fieldErrors.pincode}
          autoComplete="postal-code"
          inputMode="numeric"
          help="6 digits, as printed on the address."
          onChange={update}
        />
      </div>

      <button className={styles.submit} type="submit" disabled={pending}>
        {pending ? 'Working out the bill…' : 'Continue to payment'}
      </button>
    </form>
  );
}
