import {
  CartSchema,
  OrganizationStatuses,
  ProductStatuses,
  type Cart,
  type CartLine,
  type Seller,
} from '@app/contracts';
import { cartLineAvailability, groupBySeller } from '@app/domain';
import type { CartLineRow } from './interfaces/cart.interface';

interface SellerLine {
  sellerId: string;
  seller: Seller;
  line: CartLine;
}

function toSellerLine(row: CartLineRow): SellerLine {
  const { product } = row;
  const purchasable =
    product.status === ProductStatuses.PUBLISHED &&
    product.organization.status === OrganizationStatuses.ACTIVE;
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
