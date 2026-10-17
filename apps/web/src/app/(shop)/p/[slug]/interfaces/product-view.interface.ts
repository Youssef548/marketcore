import type { PublicProduct } from '@app/contracts';

export interface ProductViewProps {
  product: PublicProduct;
  onAdd: (quantity: number) => void;
  adding: boolean;
  added: boolean;
}
