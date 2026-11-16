export interface DeliveryAddress {
  name: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
}

export type AddressField = keyof DeliveryAddress;

export type AddressFieldErrors = Partial<Record<AddressField, string>>;

export interface CheckoutTotals {
  subtotalPaise: number;
  deliveryChargePaise: number;
  totalPaise: number;
}

export interface CheckoutLine {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  unitPricePaise: number;
  lineTotalPaise: number;
  availableQuantity: number;
  archived: boolean;
}

export interface CheckoutSessionView extends CheckoutTotals {
  id: string;
  razorpayOrderId: string;
  keyId: string;
  currency: 'INR';
  sandbox: boolean;
}

export interface PlacedOrder {
  id: string;
  orderNumber: string;
  totalPaise: number;
  paymentStatus: string;
}

export interface OrderConfirmation {
  id: string;
  orderNumber: string;
  subtotalPaise: number;
  deliveryChargePaise: number;
  totalPaise: number;
  paymentStatus: string;
  createdAt: Date;
  address: DeliveryAddress;
  items: Array<{
    productName: string;
    unitPricePaise: number;
    quantity: number;
    lineTotalPaise: number;
  }>;
}
