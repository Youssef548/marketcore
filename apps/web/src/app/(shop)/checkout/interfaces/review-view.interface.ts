import type { Cart, CheckoutLineRequest } from '@app/contracts';

export interface ReviewViewProps {
  cart: Cart;
  notice: string | null;
  placing: boolean;
  onPlace: (lines: CheckoutLineRequest[]) => void;
}
