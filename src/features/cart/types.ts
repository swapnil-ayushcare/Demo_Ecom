export const MAX_CART_LINE_QUANTITY = 99;

export interface CartLine {
  id: string;
  productId: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  unitPricePaise: number;
  quantity: number;
  lineTotalPaise: number;
  stockQuantity: number;
}

export interface Cart {
  id: string | null;
  currency: 'INR';
  lines: CartLine[];
  itemCount: number;
  lineCount: number;
  subtotalPaise: number;
}

export function emptyCart(): Cart {
  return {
    id: null,
    currency: 'INR',
    lines: [],
    itemCount: 0,
    lineCount: 0,
    subtotalPaise: 0,
  };
}
