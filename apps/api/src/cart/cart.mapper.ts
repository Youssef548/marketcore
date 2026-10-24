import { CartSchema, type Cart } from '@app/contracts';
import { MIN_PUBLISHABLE_PRICE_MINOR, cartLineAvailability, groupBySeller, isPurchasable } from '@app/domain';
import type { CartLineRow } from './interfaces/cart.interface';
import type { SellerLine } from './interfaces/seller-line.interface';

function toSellerLine(row: CartLineRow): SellerLine {
  const { product } = row;
  const visible = isPurchasable({
    status: product.status,
    organizationStatus: product.organization.status,
  });
  // A published product priced below the minimum is not representable in a cart (the
  // contract floors a price at 1) and must not be offered at a price the checkout
  // would refuse. Masked, exactly as a non-public product is (D86), so a row in that
  // state degrades to "sold out" instead of failing the parse with a 500.
  const purchasable = visible && product.priceMinor >= MIN_PUBLISHABLE_PRICE_MINOR;
  // D86: a product that stopped being public reveals neither its price nor its stock.
  const available = purchasable ? (product.inventory?.available ?? 0) : 0;

  return {
    sellerId: product.organization.id,
    seller: { name: product.organization.name, slug: product.organization.slug },
    line: {
      productId: row.productId,
      name: product.name,
      quantity: row.quantity,
      currency: product.currency,
      addedUnitPriceMinor: row.addedUnitPriceMinor,
      currentUnitPriceMinor: purchasable ? product.priceMinor : null,
      available,
      availability: cartLineAvailability(row.quantity, available, purchasable),
    },
  };
}

export function toCart(rows: readonly CartLineRow[]): Cart {
  return CartSchema.parse({
    sellers: groupBySeller(rows.map(toSellerLine)).map((group) => ({
      seller: group.lines[0].seller,
      lines: group.lines.map((entry) => entry.line),
    })),
  });
}
