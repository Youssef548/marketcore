import { Card, CardVariants } from '@app/ui';
import { BrandMarkSizes } from './constants';
import type {
  AuthCardProps,
  BrandMarkProps,
  CardBrandProps,
  PublicFrameProps,
} from './interfaces/public-frame.interface';

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
export function PublicFrame({ appName, aside, children }: PublicFrameProps) {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-canvas to-sunken">
      <header className="flex h-15 shrink-0 items-center justify-between gap-4 border-b border-rule bg-panel px-4 sm:px-9">
        <span className="flex items-center gap-3">
          <BrandMark size={BrandMarkSizes.SM} />
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
export function AuthCard({ wide = false, children }: AuthCardProps) {
  return (
    <Card
      variant={CardVariants.RAISED}
      className={`w-full ${wide ? 'max-w-[30rem]' : 'max-w-[27.5rem]'} p-6 sm:p-9`}
    >
      {children}
    </Card>
  );
}

/**
 * The product's name at the head of a card, mark first. Decoration around a name: the
 * mark is hidden from assistive technology, and the name is what is read.
 */
export function CardBrand({ appName }: CardBrandProps) {
  return (
    <div className="mb-6 flex items-center gap-3">
      <BrandMark size={BrandMarkSizes.MD} />
      <span className="text-lg font-bold leading-tight tracking-tight text-ink">{appName}</span>
    </div>
  );
}

/**
 * The mark the rail draws, on the action colour rather than the rail's: the same square
 * with the same corner stroke, so the front door and the console read as one product.
 */
export function BrandMark({ size }: BrandMarkProps) {
  const box = size === BrandMarkSizes.SM ? 'h-7 w-7 rounded-[8px]' : 'h-8 w-8 rounded-[9px]';
  const inset = size === BrandMarkSizes.SM ? 'inset-[7px]' : 'inset-[8px]';

  return (
    <span aria-hidden className={`relative inline-block shrink-0 bg-action ${box}`}>
      <span className={`absolute ${inset} block border-b-2 border-l-2 border-ink-on-action`} />
    </span>
  );
}
