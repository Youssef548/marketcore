import { Module } from '@nestjs/common';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { CartRepository } from './repositories/cart.repository';

// CartRepository is exported so the checkout transaction can call its
// transaction-client methods (D93); no other module reads the cart tables.
@Module({ controllers: [CartController], providers: [CartRepository, CartService], exports: [CartRepository] })
export class CartModule {}
