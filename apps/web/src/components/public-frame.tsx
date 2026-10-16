import type { ReactNode } from 'react';

/**
 * The frame every screen outside the shell sits in: sign in, register, and the first-run
 * screen a user with no organization sees instead of the shell.
 *
 * The composition is the Stitch screens' (040, 046, 032): a slim public bar carrying the
 * product's name, and one card centred on the canvas beneath it. What those screens put
 * around that — a status light, docs and support links, a help centre, SSO, a legal footer —
 * is left out, because none of it exists and a link to nothing is a dead end with a label.
 *
 * Colours are the token layer's only, so the frame is Quartz or Graphite by the theme
 * cookie alone, with no branch here.
 */
export function PublicFrame({
  appName,
  aside,
  children,
}: {
  appName: string;
  /** The bar's right-hand side: who is signed in, on the one screen where someone is. */
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-canvas to-sunken">
      <header className="flex h-15 shrink-0 items-center justify-between gap-4 border-b border-rule bg-panel px-4 sm:px-9">
        <span className="flex items-center gap-3">
          <BrandMark size="sm" />
          <span className="text-base font-bold tracking-tight text-ink">{appName}</span>
        </span>
        {aside}
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-8 sm:px-5 sm:py-12">
        {children}
      </main>
    </div>
  );
}

/**
 * The card a credential form sits on: the panel, an 18px radius and a hairline, as the
 * Stitch auth cards draw it. `wide` is the first-run card, which carries more prose.
 */
export function AuthCard({ wide = false, children }: { wide?: boolean; children: ReactNode }) {
  return (
    <div
      className={`w-full ${wide ? 'max-w-[30rem]' : 'max-w-[27.5rem]'} rounded-[18px] border border-rule bg-panel p-6 shadow-sm sm:p-9`}
    >
      {children}
    </div>
  );
}

/**
 * The product's name at the head of a card, mark first. Decoration around a name: the
 * mark is hidden from assistive technology, and the name is what is read.
 */
export function CardBrand({ appName }: { appName: string }) {
  return (
    <div className="mb-6 flex items-center gap-3">
      <BrandMark size="md" />
      <span className="text-lg font-bold leading-tight tracking-tight text-ink">{appName}</span>
    </div>
  );
}

/**
 * The mark the rail draws, on the action colour rather than the rail's: the same square
 * with the same corner stroke, so the front door and the console read as one product.
 */
export function BrandMark({ size }: { size: 'sm' | 'md' }) {
  const box = size === 'sm' ? 'h-7 w-7 rounded-[8px]' : 'h-8 w-8 rounded-[9px]';
  const inset = size === 'sm' ? 'inset-[7px]' : 'inset-[8px]';

  return (
    <span aria-hidden className={`relative inline-block shrink-0 bg-action ${box}`}>
      <span className={`absolute ${inset} block border-b-2 border-l-2 border-ink-on-action`} />
    </span>
  );
}

/** A trailing arrow for a primary action, as the Stitch buttons carry. Decoration only. */
export function ArrowIcon() {
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 16 16"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}
