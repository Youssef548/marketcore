import { CartLineAvailabilities, type CartLine } from '@app/contracts';

/** The product page's stock line: the exact count is public (D61). */
export function stockLabel(available: number): string {
  if (available === 0) return 'Sold out';
  if (available === 1) return '1 left';
  return `${available} in stock`;
}

/** A cart line's flag (PRD-FR-CART-003); null when there is nothing to say. */
export function lineAvailabilityLabel(line: Pick<CartLine, 'availability' | 'available'>): string | null {
  switch (line.availability) {
    case CartLineAvailabilities.SOLD_OUT:
      return 'Sold out';
    case CartLineAvailabilities.SHORT:
      return `Only ${line.available} left`;
    default:
      return null;
  }
}
