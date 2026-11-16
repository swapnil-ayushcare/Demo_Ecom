import { serializeCartCookie } from './cartService';

export { serializeCartCookie };

/**
 * Read a cart mutation body as JSON or form data. The cart never accepts a
 * price from the browser; only a product id and a quantity are read.
 */
export async function readCartPayload(request: Request): Promise<unknown> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    return await request.json();
  }

  if (
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data')
  ) {
    const form = await request.formData();
    const payload: Record<string, unknown> = {};
    form.forEach((value, key) => {
      if (typeof value === 'string') {
        payload[key] = value;
      }
    });
    return payload;
  }

  return {};
}

export function parseCartQuantity(value: unknown, fallback?: number): number {
  if (value === undefined || value === null || value === '') {
    return fallback ?? Number.NaN;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return Number(value.trim());
  }
  return Number.NaN;
}
