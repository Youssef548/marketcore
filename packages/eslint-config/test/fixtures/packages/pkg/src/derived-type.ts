// The one shape that stays beside its source: a type derived from a value in this file.
const Sizes = { LG: 'lg', MD: 'md' } as const;

export type SizeName = (typeof Sizes)[keyof typeof Sizes];

export const fallback: SizeName = Sizes.MD;
