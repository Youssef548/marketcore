/** One line of a checkout placement, as the request body carries it. */
export interface PlacementLine {
  productId: string;
  quantity: number;
  unitPriceMinor: number;
}
