import type { Cart, CartLine } from '@app/contracts';

export interface CartViewProps {
  cart: Cart;
  conflict: boolean;
  onQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
}

export interface PriceProps {
  line: CartLine;
}
