/** The two sizes the product mark is drawn at: the public bar's, and the card's. */
export const BrandMarkSizes = { SM: 'sm', MD: 'md' } as const;
export type BrandMarkSize = (typeof BrandMarkSizes)[keyof typeof BrandMarkSizes];
