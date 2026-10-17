import type { CartLine, CheckoutLineRequest, CurrencyCode } from '@app/contracts';

/** A line whose current price differs from the price it was added at (D60). */
export interface PriceChange {
  productId: string;
  name: string;
  fromMinor: number;
  toMinor: number;
  currency: CurrencyCode;
}

export interface StockProblem {
  productId: string;
  name: string;
  label: string;
}

export interface Review {
  lines: CartLine[];
  priceChanges: PriceChange[];
  stockProblems: StockProblem[];
  mixedCurrency: boolean;
  currency: CurrencyCode | null;
  totalMinor: number;
  confirmedLines: CheckoutLineRequest[];
}
