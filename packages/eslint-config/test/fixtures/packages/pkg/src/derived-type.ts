// Types that stay beside their source: derived from a value in this file, or private to it.
const Sizes = { LG: 'lg', MD: 'md' } as const;

export type SizeName = (typeof Sizes)[keyof typeof Sizes];

type Local = { size: SizeName };

export const fallback: Local = { size: Sizes.MD };
