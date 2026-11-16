import { randomBytes } from 'node:crypto';
import { razorpaySignature } from './razorpay';

export type SandboxPaymentResult =
  | {
      status: 'created';
      razorpay_order_id: string;
      razorpay_payment_id: string;
      razorpay_signature: string;
    }
  | { status: 'cancelled' };

/**
 * The documented sandbox substitute for Razorpay's test Checkout. It produces
 * only a provider-shaped payment id and the HMAC the real provider would send;
 * the shop's verify endpoint checks that HMAC with the same server secret.
 * It is available only when RAZORPAY_SANDBOX=1.
 */
export function createSandboxPayment(
  razorpayOrderId: string,
  method: 'upi' | 'card' | 'cancel',
): SandboxPaymentResult {
  if (method === 'cancel') {
    return { status: 'cancelled' };
  }

  const razorpayPaymentId = `pay_sb_${randomBytes(10).toString('hex')}`;
  return {
    status: 'created',
    razorpay_order_id: razorpayOrderId,
    razorpay_payment_id: razorpayPaymentId,
    razorpay_signature: razorpaySignature(razorpayOrderId, razorpayPaymentId),
  };
}
