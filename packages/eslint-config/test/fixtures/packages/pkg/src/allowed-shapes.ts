// Shapes that stay: a const-object enum with its derived type, a union of keys passed to Omit, and
// a tagged union whose literals are discriminants rather than options.
const Sizes = { LG: 'lg', MD: 'md' } as const;
type Size = (typeof Sizes)[keyof typeof Sizes];

interface Base {
  size: Size;
  id: string;
}

type WithoutKeys = Omit<Base, 'size' | 'id'>;
type Outcome = { kind: 'ok' } | { kind: 'failed'; reason: string };

export const shapes: [Size, WithoutKeys, Outcome] | null = null;
