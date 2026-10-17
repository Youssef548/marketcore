import type { CurrencyCode } from '@app/contracts';

const LOCALES: Record<CurrencyCode, string> = { EGP: 'en-EG', USD: 'en-US', EUR: 'en-IE' };

/** Minor units per major unit. Every currency in the closed set has two decimals. */
const MINOR_PER_MAJOR: Record<CurrencyCode, number> = { EGP: 100, USD: 100, EUR: 100 };

/**
 * The one place in the repository that divides money — for display only, after
 * every calculation has been done in integers (platform D9).
 */
export function formatMoney(amountMinor: number, currency: CurrencyCode): string {
  return new Intl.NumberFormat(LOCALES[currency], {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
  }).format(amountMinor / MINOR_PER_MAJOR[currency]);
}
