# MarketCore T-002 — the shared shell on the Stitch dashboard, and the console under `/admin` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:executing-plans` to implement this
> plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. `superpowers:test-driven-development`
> applies to every task: write the test, watch it fail for the right reason, implement, watch it pass.

**Goal:** Close T-002 and milestone **M0 (one look)** — the shell every operator page sits in is the
Stitch 001 layout (grouped left rail, breadcrumb top bar, the page owning its own `h1`), and the
operator console lives under `/admin` with its old URLs permanently redirecting (D92).

**Architecture:** Three moves on one branch stack, each independent of the one above it. The **URL
move** renames the two console route segments under `/admin`, puts the legacy-path decision in
`apps/web/src/lib/session/routing.ts` so it is unit-testable, and lets `apps/web/src/middleware.ts`
translate that decision into a 308 — the seam the auth gate already uses. The **landings** task makes
every place this app sends a visitor name `/admin` itself instead of relying on that redirect. The
**re-skin** replaces the shell's two page-name sources with one: a single navigation registry
(`apps/web/src/app/(dash)/navigation.ts`) holds the sections the rail groups and the breadcrumb
derives, and the `h1` leaves the top bar for each page's own head. No token, component or API change;
every colour is an existing semantic token.

**Spec:** `docs/superpowers/specs/2026-10-17-cr-002-phase-4-rulings.md` — **D92** (the console lives
under `/admin`; `/dashboard` and `/products` redirect permanently) binds this phase. **D91** (every
signed-in user lands on the storefront) is **deferred**: `/browse` is T-021's route and does not
exist, so there is nothing to land on. The release plan's T-002 row carries D91 as well — that is the
one clause of the row this phase does not satisfy, and it is recorded as a deferral in
`docs/superpowers/STATUS.md`, in the pull request and in this plan.

**Read with it:** `docs/superpowers/plans/2026-10-16-marketcore-release-1.md` §2 (T-002) and §4 (M0),
`docs/design/deliverables/ui/stitch/README.md` and the screens `001` (the shell's design source) and
`048` (the same shell, products), `docs/adr/012-component-layer.md`, `013-design-direction-quartz.md`.
Task T-001 (`49f763a`) re-skinned the four pages to 040/046/032/048 and deliberately left the shell
alone — this plan finishes the epic.

**Tech stack:** Next.js 15.5 App Router + React 19 (`apps/web`), Tailwind 4 with the CSS-first token
layer in `packages/ui/src/tokens.css`, vitest 2 + Testing Library (unit), Playwright 1.49 (behavioural),
Turborepo 2 (gate).

---

## Branch stack

Each slice is at most 15 files, holds one topic, and passes the whole-repo gate on its own. Merge
bottom to top; nothing below depends on anything above it.

| # | Branch | Base | Topic | Files |
|---|---|---|---|---|
| 1 | `feat/t002-admin-routes` | `main` | This plan, then D92 — the console moves to `/admin`, permanently | 12 |
| 2 | `feat/t002-landings` | `feat/t002-admin-routes` | Every landing this app owns names `/admin` instead of relying on the redirect | 5 |
| 3 | `feat/t002-shell-chrome` | `feat/t002-landings` | The shell: grouped rail, breadcrumb, the page's own `h1` | 13 |

## Global constraints

- **Only what works ships.** The Stitch rail and top bar draw a search box with `⌘K`, a notifications
  button with a badge, and counts on nav items. None of those features exist, so none of them are
  built. A control that answers nothing is the scaffolding this repository refuses.
- **One fact, one place.** The tenant (organization switcher) and the signed-in user stay in the top
  bar and appear nowhere in the rail; `chrome.test.tsx` asserts it and keeps asserting it.
- **Semantic tokens only.** Every colour is an existing `--color-*` role: `bg-rail`,
  `text-ink-on-rail`, `text-ink-on-rail-muted`, `bg-rail-hover`, `bg-rail-active`, `text-ink-on-action`,
  `bg-panel`, `bg-sunken`, `text-ink`, `text-ink-muted`, `text-ink-faint`, `border-rule`,
  `border-rail-edge`, `border-control-edge`. No new token, no `--palette-*` reference, no pair added to
  `packages/ui/test/tokens.spec.ts`, no component naming a colour literal.
- **12px type floor.** The Stitch files' `.navhead` is 12px in 001 and **11px in 048**; the floor wins,
  so the section label is `text-xs` with the design's wide tracking.
- **No relative colour syntax.** No `color-mix()`, no `oklch()` in a component — values stay literals
  in `tokens.css`, so contrast is readable before it ships.
- `packages/ui` keeps zero runtime dependencies and never imports `next` or an `apps/*` path.
- A URL that a test asserts is written literally in that test; a URL used as a fixture is the named
  constant.

---

## Task 1 — The console moves to `/admin`

**Files**

- `docs/superpowers/plans/2026-10-16-marketcore-stitch-reskin.md` — this plan.
- `apps/web/src/app/(dash)/dashboard/page.tsx` → `apps/web/src/app/(dash)/admin/page.tsx` — move; the
  "Go to the catalog" link becomes `/admin/products`.
- `apps/web/src/app/(dash)/products/page.tsx` → `apps/web/src/app/(dash)/admin/products/page.tsx` — move.
- `apps/web/src/lib/session/routing.ts` — modify: `ADMIN_PATH`, `ADMIN_PRODUCTS_PATH`, the moved-path
  table, `movedTo`, and the new arm of `decideRoute`. `DASHBOARD_PATH` is gone.
- `apps/web/src/lib/session/interfaces/routing.interface.ts` — modify: `RoutingDecision` gains a
  `moved` arm.
- `apps/web/src/lib/session/routing.test.ts` — modify: every path is `/admin…`; new cases for the move.
- `apps/web/src/middleware.ts` — modify: translate a `moved` decision into 308; extend `matcher`.
- `apps/web/src/app/(dash)/rail.tsx` — modify: nav and brand hrefs.
- `apps/web/src/app/(dash)/page-title.ts`, `page-title.test.ts` — modify: the map's keys.
- `apps/web/src/app/(dash)/chrome.test.tsx` — modify: the mocked pathname, named rather than typed.
- `apps/e2e/tests/web-journey.spec.ts` — modify: every console path, plus one test that the old URLs
  arrive permanently redirected.

**Interfaces**

```ts
// apps/web/src/lib/session/interfaces/routing.interface.ts
export type RoutingDecision =
  | { kind: 'next' }
  | { kind: 'redirect'; to: string }
  /** This URL moved for good: the client should replace what it holds (D92). */
  | { kind: 'moved'; to: string };
```

```ts
// apps/web/src/lib/session/routing.ts — the load-bearing part, written out
export const ADMIN_PATH = '/admin';
export const ADMIN_PRODUCTS_PATH = `${ADMIN_PATH}/products`;
export const LOGIN_PATH = '/login';
export const REGISTER_PATH = '/register';

/**
 * The console's old URLs (D92). `/dashboard` and `/products` were its address for two
 * phases; a bookmark and a search result still hold them, so they move the visitor
 * rather than 404 them.
 */
const MOVED_PATHS: Readonly<Record<string, string>> = {
  '/dashboard': ADMIN_PATH,
  '/products': ADMIN_PRODUCTS_PATH,
};

/** Where a moved URL now lives, or null when the path never moved. */
export function movedTo(pathname: string): string | null {
  return MOVED_PATHS[pathname] ?? null;
}

export function isProtected(pathname: string): boolean {
  return pathname === ADMIN_PATH || pathname.startsWith(`${ADMIN_PATH}/`);
}

export function decideRoute(pathname: string, signedIn: boolean): RoutingDecision {
  // Before the gate, because a move is about the address and not about the session:
  // `/dashboard` while signed out must still become `/admin`, and *then* ask for
  // credentials, so the `next` the visitor returns to is the address that lives.
  const moved = movedTo(pathname);
  if (moved !== null) return { kind: 'moved', to: moved };

  if (!signedIn && isProtected(pathname)) {
    return { kind: 'redirect', to: `${LOGIN_PATH}?next=${encodeURIComponent(pathname)}` };
  }

  // A signed-in visitor has no use for the credential pages; the API would refuse
  // the login they submitted anyway.
  if (signedIn && isCredentialPage(pathname)) {
    return { kind: 'redirect', to: ADMIN_PATH };
  }

  return { kind: 'next' };
}
```

```ts
// apps/web/src/middleware.ts — the adapter's new arm, and the new matcher
/**
 * 308 rather than 307: the console's old URLs moved for good (D92), so a bookmark
 * and a crawler replace what they hold instead of asking again for ever.
 */
const PERMANENT_REDIRECT_STATUS = 308;

if (decision.kind === 'moved') {
  return NextResponse.redirect(new URL(decision.to, request.url), PERMANENT_REDIRECT_STATUS);
}

export const config = {
  /*
   * `/dashboard` and `/products` are here only to be redirected. `/admin` is the
   * console's real address and the protected prefix; `/api/session` stays absent for
   * the reason it always was: it does its own checking and rotates the tokens.
   */
  matcher: ['/admin/:path*', '/dashboard', '/products', '/login', '/register'],
};
```

**Consumes:** `RoutingDecision`, `NextResponse`, `SESSION_COOKIES`, `ADMIN_PATH`.
**Produces:** `/admin` and `/admin/products` as the console's routes; a 308 from `/dashboard` and
`/products`; `ADMIN_PATH` / `ADMIN_PRODUCTS_PATH` as the one definition of those URLs.

**Test cases**

| Claim | Test | Level |
|---|---|---|
| An anonymous visitor to `/admin` is sent to sign in carrying `/admin` | `routing.test.ts` | unit |
| A signed-in visitor to a credential page lands on `/admin` | `routing.test.ts` | unit |
| `/administration` is a different route and is not gated | `routing.test.ts` | unit |
| A moved URL is decided by the move, signed in or not | `routing.test.ts` — both arms return `{ kind: 'moved', to: '/admin' }` | unit |
| `/products` moves to `/admin/products` | `routing.test.ts` | unit |
| A deeper path that never moved is not moved | `routing.test.ts` — `movedTo('/products/123')` is null | unit |
| The page-title map names the new console paths | `page-title.test.ts` | unit |
| The shell renders its title for the mocked console path | `chrome.test.tsx` | unit |
| The old URLs answer 308 and a browser lands on the new one | `web-journey.spec.ts` — a `response` listener sees `308` for `/dashboard`, and `page.goto` ends on `/admin` | behavioural |

---

## Task 2 — Every landing this app owns names `/admin`

**Files**

- `apps/web/src/lib/http/browser.ts`, `browser.test.ts` — modify: `safeRedirect` takes its fallback.
- `apps/web/src/app/(auth)/login/page.tsx`, `page.test.tsx` — modify: the caller passes `ADMIN_PATH`.
- `apps/web/src/app/page.tsx`, `page.test.tsx` — modify: the front door lands on `/admin`.

**Interfaces**

```ts
// apps/web/src/lib/http/browser.ts
export function safeRedirect(target: string | null, fallback: string): string {
  if (target === null || !target.startsWith('/') || target.startsWith('//')) {
    return fallback;
  }
  return target;
}
```

**Consumes:** `ADMIN_PATH` (Task 1).
**Produces:** no `/dashboard` left in the app's own navigation; the place a signed-in visitor lands is
named by the page that sends them there — the seam D91 changes.

**Test cases**

| Claim | Test | Level |
|---|---|---|
| A refused `next` falls back to the path the caller named | `browser.test.ts` | unit |
| `//evil.test` and `https://evil.test` still fall back rather than redirect off-site | `browser.test.ts` | unit |
| Signing in with no `next` lands on `/admin` | `login/page.test.tsx` | unit |
| Signing in with `next=/admin/orders` goes where it was asked | `login/page.test.tsx` | unit |
| The front door sends a cookie-holding visitor to `/admin` | `page.test.tsx` | unit |
| No `'/dashboard'` remains as a destination in `apps/web/src` | `git grep "'/dashboard'" -- apps/web/src` | grep |

---

## Task 3 — The shell: grouped rail, breadcrumb top bar, the page's own `h1`

**Files**

- `apps/web/src/app/(dash)/navigation.ts` — **new**: `NavGroups`, `NAV_SECTIONS`, `breadcrumbFor`.
- `apps/web/src/app/(dash)/interfaces/navigation.interface.ts` — **new**: `NavEntry`, `NavSection`,
  `PageBreadcrumb`.
- `apps/web/src/app/(dash)/navigation.test.ts` — **new**: the two derivations agree.
- `apps/web/src/app/(dash)/page-title.ts`, `page-title.test.ts` — **deleted** (replaced above).
- `apps/web/src/app/(dash)/rail.tsx` — modify: render the sections with their heading; keep the
  tenant, the user and every count out.
- `apps/web/src/app/(dash)/top-bar.tsx` — modify: the `h1` is gone; a `<nav aria-label="Breadcrumb">`
  takes its place. The switcher, the chip, the theme toggle and Sign out stay.
- `apps/web/src/app/(dash)/admin/page.tsx`, `admin/products/page.tsx` — modify: each page owns its
  `<h1>` through `PageHeading level={HeadingLevels.H1}`.
- `apps/web/src/app/(dash)/chrome.test.tsx` — modify: the moved `h1` assertion, the breadcrumb and
  the section headings.
- `packages/ui/src/constants.ts`, `packages/ui/src/interfaces/page-heading.interface.ts` — modify: the
  comments that say the shell's top bar holds the `h1`. It no longer does.
- `apps/e2e/tests/web-journey.spec.ts` — modify: the products page's own `h1`, and the breadcrumb.

**Interfaces**

```ts
// apps/web/src/app/(dash)/interfaces/navigation.interface.ts
export interface NavEntry {
  href: string;
  label: string;
}

export interface NavSection {
  group: NavGroup;
  entries: readonly NavEntry[];
}

/** Where a page sits, as the top bar's breadcrumb reads it: `Catalog / Products`. */
export interface PageBreadcrumb {
  group: NavGroup;
  label: string;
}
```

```ts
// apps/web/src/app/(dash)/navigation.ts
import { ADMIN_PATH, ADMIN_PRODUCTS_PATH } from '@/lib/session/routing';
import type { NavEntry, NavSection, PageBreadcrumb } from './interfaces/navigation.interface';

/** The rail's sections, as a closed set, so the heading and the crumb cannot drift. */
export const NavGroups = { DASHBOARD: 'Dashboard', CATALOG: 'Catalog' } as const;
export type NavGroup = (typeof NavGroups)[keyof typeof NavGroups];

/**
 * Every console page, once.
 *
 * The rail groups these under their heading and the breadcrumb reads its parent from
 * the same field, because "which section is this page in" is one fact — two lists
 * would let the rail say Catalog while the crumb said something else. Only pages that
 * exist are listed: no entry is written ahead of its screen.
 */
export const NAV_SECTIONS: readonly NavSection[] = [
  { group: NavGroups.DASHBOARD, entries: [{ href: ADMIN_PATH, label: 'Overview' }] },
  { group: NavGroups.CATALOG, entries: [{ href: ADMIN_PRODUCTS_PATH, label: 'Products' }] },
];

/** The section each page belongs to, derived from the sections themselves. */
const PAGE_GROUPS = new Map<string, PageBreadcrumb>(
  NAV_SECTIONS.flatMap(({ group, entries }) =>
    entries.map(({ href, label }): [string, PageBreadcrumb] => [href, { group, label }]),
  ),
);

/**
 * What the top bar's breadcrumb says for a path, or null for a path this shell was
 * never told about. Null is the honest answer: a crumb invented from a path segment
 * would be the shell claiming to know a page that does not exist.
 */
export function breadcrumbFor(pathname: string): PageBreadcrumb | null {
  return PAGE_GROUPS.get(pathname) ?? null;
}
```

```tsx
// rail.tsx — the grouped nav, and nothing else
<nav aria-label="Primary">
  {NAV_SECTIONS.map(({ group, entries }) => (
    <div key={group}>
      <span className="block px-2.5 pb-1 pt-3.5 text-xs font-semibold uppercase tracking-[0.13em] text-ink-on-rail-muted">
        {group}
      </span>
      {entries.map(({ href, label }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`block rounded-brand px-2.5 py-2 text-sm ${
              active
                ? 'bg-rail-active font-semibold text-ink-on-action'
                : 'text-ink-on-rail-muted hover:bg-rail-hover hover:text-ink-on-rail'
            }`}
          >
            {label}
          </Link>
        );
      })}
    </div>
  ))}
</nav>
```

```tsx
// top-bar.tsx — the breadcrumb where the h1 was, and no h1 here at all
const crumb = breadcrumbFor(pathname);
…
{crumb !== null && (
  <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm font-semibold">
    <span className="font-medium text-ink-muted">{crumb.group}</span>
    <span aria-hidden className="text-ink-faint">
      /
    </span>
    <span className="text-ink">{crumb.label}</span>
  </nav>
)}
```

**Consumes:** `ADMIN_PATH`, `ADMIN_PRODUCTS_PATH` (Task 1), `PageHeading`, `HeadingLevels` from `@app/ui`.
**Produces:** `NAV_SECTIONS`, `NavGroups`, `breadcrumbFor` — one page registry for the rail and the
top bar; a console page owning the document's only `h1`.

**Test cases**

| Claim | Test | Level |
|---|---|---|
| The crumb names the page and its section | `navigation.test.ts` — `/admin` → `{ Dashboard, Overview }`, `/admin/products` → `{ Catalog, Products }` | unit |
| An unknown path gets no crumb rather than an invented one | `navigation.test.ts` — `/admin/orders` → null | unit |
| Every nav entry resolves to a crumb naming its own group and label | `navigation.test.ts`, derived over `NAV_SECTIONS` | unit |
| The rail groups the nav and marks where you are | `chrome.test.tsx` — the `complementary` landmark contains the two headings and the current entry carries `aria-current="page"` | unit |
| The top bar holds no heading and holds the breadcrumb | `chrome.test.tsx` — no `heading` inside the `banner`; a `Breadcrumb` navigation reading `Dashboard / Overview` | unit |
| The page owns the document's only `h1`, and it agrees with the crumb | `chrome.test.tsx` — the shell rendering `DashboardPage` has exactly one `level: 1` heading named "Overview" | unit |
| The tenant and the user are still only in the top bar | `chrome.test.tsx` — unchanged assertion | unit |
| A real browser paints the page's `h1` and the crumb | `web-journey.spec.ts` | behavioural |

---

## Verification

| Layer | Command | What it proves |
|---|---|---|
| Each slice | `pnpm turbo run lint typecheck test build` | 33/33 tasks, 0 failed |
| Unit | `pnpm --filter web test`, `pnpm --filter @app/ui test` | the registry, the gate, the shell |
| Behavioural | `docker compose -f docker-compose.e2e.yml up -d --build --wait && pnpm --filter e2e test:behavioural` | ≥ 20 passed — TLS, a real browser, the moved `h1` |
| The move, at the server | `curl -sI -o /dev/null -w '%{http_code}' -k https://web.marketcore.test:8443/dashboard` | `308` |
| The gate can fail | break the implementation, watch the regression test go red, restore | the test is a test |

## Deviations this plan carries

- **D91 is deferred, not delivered.** `/browse` is T-021's route; landing every signed-in user on it
  needs the storefront to exist. Post-sign-in landing stays at `/admin`. Cost if the ruling is wrong:
  T-002 is recorded complete while one clause of its row is not, and the storefront phase must make
  the landing change itself — one line in `login/page.tsx`, whose redirect target Task 2 already
  makes an argument.
- **`safeRedirect` takes its fallback as an argument** rather than importing a constant: where a
  signed-in visitor lands is the caller's fact, and the D91 change is then one line. Cost if wrong:
  one extra parameter on a helper with one caller.
- **`DASHBOARD_PATH` is renamed `ADMIN_PATH`.** The phase-4 plan's Task 20 snippet names the old
  constant; it describes a shell that no longer exists and is re-read at its own gate.
