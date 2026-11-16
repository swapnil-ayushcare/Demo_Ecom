import type { AddressFieldErrors, DeliveryAddress } from './types';

const NAME_MAX_LENGTH = 80;
const LINE_MAX_LENGTH = 120;
const CITY_MAX_LENGTH = 80;
const STATE_MAX_LENGTH = 80;

function asRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }
  return input as Record<string, unknown>;
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function collapse(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.slice(1);
  }
  return digits;
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

export { isUuid };

/**
 * Validate a delivery address from untrusted input. Every refusal is
 * field-level so the form can put the message under the right control.
 */
export function validateDeliveryAddress(input: unknown): {
  address: DeliveryAddress | null;
  fieldErrors: AddressFieldErrors;
} {
  const raw = asRecord(input);
  const fieldErrors: AddressFieldErrors = {};

  const name = collapse(readText(raw.name));
  if (name.length === 0) {
    fieldErrors.name = 'Enter the name for this delivery.';
  } else if (name.length < 2) {
    fieldErrors.name = 'Enter the full name, at least 2 characters.';
  } else if (name.length > NAME_MAX_LENGTH) {
    fieldErrors.name = `Keep the name to ${NAME_MAX_LENGTH} characters or fewer.`;
  }

  const phone = normalizePhone(readText(raw.phone));
  if (phone.length === 0) {
    fieldErrors.phone = 'Enter a phone number the delivery person can call.';
  } else if (!/^[6-9]\d{9}$/.test(phone)) {
    fieldErrors.phone = 'Enter a 10-digit Indian mobile number starting 6–9.';
  }

  const line1 = collapse(readText(raw.line1));
  if (line1.length === 0) {
    fieldErrors.line1 = 'Enter the house or building and street.';
  } else if (line1.length < 3) {
    fieldErrors.line1 = 'Add a little more of the address.';
  } else if (line1.length > LINE_MAX_LENGTH) {
    fieldErrors.line1 = `Keep this line to ${LINE_MAX_LENGTH} characters or fewer.`;
  }

  const line2 = collapse(readText(raw.line2));
  if (line2.length > LINE_MAX_LENGTH) {
    fieldErrors.line2 = `Keep this line to ${LINE_MAX_LENGTH} characters or fewer.`;
  }

  const city = collapse(readText(raw.city));
  if (city.length === 0) {
    fieldErrors.city = 'Enter the city or town.';
  } else if (city.length < 2) {
    fieldErrors.city = 'Enter the city or town name.';
  } else if (city.length > CITY_MAX_LENGTH) {
    fieldErrors.city = `Keep the city to ${CITY_MAX_LENGTH} characters or fewer.`;
  }

  const state = collapse(readText(raw.state));
  if (state.length === 0) {
    fieldErrors.state = 'Enter the state.';
  } else if (state.length < 2) {
    fieldErrors.state = 'Enter the state name.';
  } else if (state.length > STATE_MAX_LENGTH) {
    fieldErrors.state = `Keep the state to ${STATE_MAX_LENGTH} characters or fewer.`;
  }

  const pincode = readText(raw.pincode).replace(/\s+/g, '');
  if (pincode.length === 0) {
    fieldErrors.pincode = 'Enter the 6-digit PIN code.';
  } else if (!/^[1-9]\d{5}$/.test(pincode)) {
    fieldErrors.pincode = 'Enter a valid 6-digit PIN code.';
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { address: null, fieldErrors };
  }

  return {
    address: { name, phone, line1, line2, city, state, pincode },
    fieldErrors,
  };
}
