/** One locked inventory row, as the checkout transaction reads it for a decision. */
export interface InventoryStockRow {
  productId: string;
  available: number;
}
