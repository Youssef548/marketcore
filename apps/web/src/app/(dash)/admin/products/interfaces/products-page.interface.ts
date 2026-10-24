import type { Product } from '@app/contracts';

export type State =
  | { status: 'loading' }
  | { status: 'ready'; products: Product[] }
  | { status: 'failed'; message: string };

export interface CountProps {
  label: string;
  value: number;
}

export interface AddProductFormProps {
  onCreated: () => Promise<void>;
}
