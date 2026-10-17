import { Injectable, NotFoundException } from '@nestjs/common';
import type { Cart } from '@app/contracts';
import type { BuyerContext } from '@app/domain';
import { CartMessages } from './cart.constants';
import { toCart } from './cart.mapper';
import { CartRepository } from './repositories/cart.repository';

@Injectable()
export class CartService {
  constructor(private readonly cartRepository: CartRepository) {}

  async get(buyer: BuyerContext): Promise<Cart> {
    await this.cartRepository.ensureCart(buyer);
    return toCart(await this.cartRepository.readLines(buyer));
  }

  /** 404 for a product that is not public (SRS-FR-CART-003); stock is not checked (D58). */
  async setLine(buyer: BuyerContext, productId: string, quantity: number): Promise<Cart> {
    const product = await this.cartRepository.findPublicPrice(productId);
    if (product === null) throw new NotFoundException(CartMessages.PRODUCT_NOT_FOUND);
    await this.cartRepository.setLine(buyer, productId, quantity, product.priceMinor);
    return this.get(buyer);
  }

  async removeLine(buyer: BuyerContext, productId: string): Promise<Cart> {
    await this.cartRepository.removeLine(buyer, productId);
    return this.get(buyer);
  }
}
