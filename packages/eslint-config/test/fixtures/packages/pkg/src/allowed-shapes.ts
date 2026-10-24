// Shapes that stay: a const-object enum with its derived type, and a union of keys passed to Omit.
// The interface and the tagged union they use live in interfaces/, as every hand-written shape does.
import type { Base } from './interfaces/base.interface';
import type { Outcome } from './interfaces/outcome.interface';

const Sizes = { LG: 'lg', MD: 'md' } as const;
export type Size = (typeof Sizes)[keyof typeof Sizes];

type WithoutKeys = Omit<Base, 'size' | 'id'>;

export const shapes: [Size, WithoutKeys, Outcome] | null = null;
