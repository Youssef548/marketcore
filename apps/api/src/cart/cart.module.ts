import { Module } from '@nestjs/common';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { CartRepository } from './repositories/cart.repository';

@Module({ controllers: [CartController], providers: [CartRepository, CartService] })
export class CartModule {}
