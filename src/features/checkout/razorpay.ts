import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getEnv } from '@/server/env';
import { CheckoutError } from './errors';

export interface ProviderOrder {
  id: string;
  amountPaise: number;
}

/**
 * The documented local sandbox. With RAZORPAY_SANDBOX=1 the shop creates a
 * provider-shaped order locally and the test fixture signs a payment with the
 * same secret; the server still verifies that signature through the real
 * HMAC path. Unset, the shop talks to Razorpay's test-mode API.
 */
export function razorpaySandboxEnabled(): boolean {
  const value = process.env.RAZORPAY_SANDBOX;
  return value === '1' || value === 'true';
}

export function razorpayKeyId(): string {
  return getEnv().RAZORPAY_KEY_ID;
}

export function razorpaySignature(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  secret = getEnv().RAZORPAY_KEY_SECRET,
): string {
  return createHmac('sha256', secret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');
}

export function verifyRazorpaySignature(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  signature: string,
): boolean {
  if (!razorpayOrderId || !razorpayPaymentId || !signature) {
    return false;
  }

  const expected = razorpaySignature(razorpayOrderId, razorpayPaymentId);
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const providedBuffer = Buffer.from(signature, 'utf8');

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

export interface CreateProviderOrderInput {
  amountPaise: number;
  receipt: string;
}

/**
 * Create the Razorpay order whose id the hosted Checkout will charge. Only
 * the public key id and this order payload are ever returned to the browser;
 * the key secret stays on the server.
 */
export async function createRazorpayOrder(
  input: CreateProviderOrderInput,
): Promise<ProviderOrder> {
  if (razorpaySandboxEnabled()) {
    return {
      id: `order_sb_${randomBytes(10).toString('hex')}`,
      amountPaise: input.amountPaise,
    };
  }

  const env = getEnv();
  const authorization = Buffer.from(
    `${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`,
    'utf8',
  ).toString('base64');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authorization}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: input.amountPaise,
        currency: 'INR',
        receipt: input.receipt,
        notes: { shop: 'Demo_Ecom' },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new CheckoutError(
        502,
        'razorpay_unavailable',
        'Razorpay could not start this payment. Your cart is unchanged; try again.',
      );
    }

    const body = (await response.json()) as { id?: unknown; amount?: unknown };
    if (
      typeof body.id !== 'string' ||
      !body.id.startsWith('order_') ||
      typeof body.amount !== 'number' ||
      body.amount !== input.amountPaise
    ) {
      throw new CheckoutError(
        502,
        'razorpay_unexpected_response',
        'Razorpay returned an unexpected order. Your cart is unchanged; try again.',
      );
    }

    return { id: body.id, amountPaise: body.amount };
  } catch (error) {
    if (error instanceof CheckoutError) {
      throw error;
    }
    throw new CheckoutError(
      502,
      'razorpay_unavailable',
      'Razorpay could not be reached. Your cart is unchanged; check the connection and try again.',
    );
  } finally {
    clearTimeout(timer);
  }
}
