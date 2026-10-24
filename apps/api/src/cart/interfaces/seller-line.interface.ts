import type { CartLine, Seller } from '@app/contracts';

export interface SellerLine {
  sellerId: string;
  seller: Seller;
  line: CartLine;
}
