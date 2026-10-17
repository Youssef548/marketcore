/**
 * The options the components take, as named values rather than string literals.
 *
 * A caller writes `variant={CardVariants.RAISED}`, so the option is found by name, renamed in one
 * place, and listed at runtime by a test. Each type is derived from its value, which is why it
 * lives here beside it rather than in `interfaces/` — the shape `@app/contracts` uses for
 * `ProductStatuses`.
 */

export const AlertVariants = { ERROR: 'error', SUCCESS: 'success' } as const;
export type AlertVariant = (typeof AlertVariants)[keyof typeof AlertVariants];

export const ButtonVariants = { PRIMARY: 'primary', SECONDARY: 'secondary', QUIET: 'quiet' } as const;
export type ButtonVariant = (typeof ButtonVariants)[keyof typeof ButtonVariants];

/**
 * One scale for every control. Button and Input used to declare the same three sizes
 * separately; they share one now, so a form's submit cannot drift from the fields above it.
 */
export const ControlSizes = { LG: 'lg', MD: 'md', SM: 'sm' } as const;
export type ControlSize = (typeof ControlSizes)[keyof typeof ControlSizes];

export const CardVariants = { PANEL: 'panel', RAISED: 'raised' } as const;
export type CardVariant = (typeof CardVariants)[keyof typeof CardVariants];

/**
 * A page's own title is `H1`; a section inside that page is `H2`. The shell does not
 * hold an `h1` of its own — it names where the page sits, in a breadcrumb — so there is
 * exactly one `h1` in a document and it belongs to the page.
 */
export const HeadingLevels = { H1: 1, H2: 2 } as const;
export type HeadingLevel = (typeof HeadingLevels)[keyof typeof HeadingLevels];
