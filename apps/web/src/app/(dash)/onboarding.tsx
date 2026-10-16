'use client';

import { useState, type FormEvent } from 'react';
import { Alert, ArrowRightIcon, Button, ControlSizes, Field, PageHeading, TextLink } from '@app/ui';
import { AuthCard, PublicFrame } from '@/components/public-frame';
import { createOrganization, signOut } from '@/lib/session/client';
import type { OnboardingProps } from './interfaces/onboarding.interface';

/**
 * The first-run screen.
 *
 * Shown when a signed-in user belongs to no organization, and shown *instead of* the shell
 * rather than inside it. That is the whole decision: a user with no organization has no
 * tenant, so every tenant-scoped control in the shell is inert — a rail with nothing to pick,
 * a nav whose pages answer "choose an organization first". Letting someone into that and
 * asking them to work it out is the dead end this replaces.
 *
 * One field, because the contract makes `slug` optional and the API derives it from the name.
 * Asking for a slug here would be asking the user to solve the API's problem.
 *
 * The layout is the Stitch first-run screen (032): the public bar with who is signed in, and
 * one centred card — an icon tile, the heading, the field, a note on what creating it makes
 * you, the action, and the way out if this is the wrong account.
 */
export function Onboarding({ appName, email, onCreated }: OnboardingProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      await createOrganization(name);
      // The shell arrives from this, not from a navigation: the organization did not exist
      // a moment ago, so there is no page to have been on.
      await onCreated();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not create the organization');
    } finally {
      setPending(false);
    }
  }

  return (
    <PublicFrame
      appName={appName}
      aside={
        <span className="flex min-w-0 items-center gap-2 rounded-brand border border-rule bg-sunken py-1 pl-1 pr-2.5">
          <span
            aria-hidden
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-panel text-xs font-bold text-ink-muted"
          >
            {email.slice(0, 1).toUpperCase()}
          </span>
          <span className="truncate font-mono text-xs font-medium text-ink">
            <span className="sr-only">Signed in as </span>
            {email}
          </span>
        </span>
      }
    >
      <AuthCard wide>
        <form className="space-y-5" onSubmit={submit} noValidate>
          {/* A `div` rather than a `header`: the public bar is this screen's banner, and
           * a second one would leave "the banner" meaning two things. */}
          <div className="mb-6 flex flex-col items-center text-center">
            <span
              aria-hidden
              className="mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-rule bg-sunken text-action"
            >
              <BuildingIcon />
            </span>
            <PageHeading className="mb-2.5">You&rsquo;re not in an organization yet</PageHeading>
            <p className="max-w-[24rem] text-sm leading-relaxed text-ink-muted">
              {appName} keeps products, orders and money inside an organization. Create one and you
              are its owner.
            </p>
          </div>

          <Field
            label="Organization name"
            name="name"
            autoComplete="organization"
            placeholder="Nile Traders"
            size={ControlSizes.LG}
            hint="Its catalog, its orders and its members all belong to it."
            value={name}
            error={null}
            onChange={(event) => setName(event.target.value)}
          />

          {/* The design's ownership note, stated as what the API does rather than what the
           * design claimed: the creating account becomes the owner, and nothing more. */}
          <div className="flex items-start gap-3 rounded-xl border border-rule bg-sunken px-3.5 py-3">
            <span
              aria-hidden
              className="mt-px grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-panel text-action"
            >
              <ShieldIcon />
            </span>
            <p className="text-xs leading-relaxed text-ink-muted">
              <b className="mb-0.5 block text-sm font-semibold text-ink">You become its owner</b>
              The console opens in the new organization as soon as it exists.
            </p>
          </div>

          {error !== null && <Alert className="border-l-4">{error}</Alert>}

          {/* `busy` rather than `disabled`: a disabled submit button drops keyboard focus and
           * sends the user back to the top of the form mid-submit. */}
          <Button type="submit" size={ControlSizes.LG} busy={pending} className="w-full">
            {pending ? 'Creating…' : 'Create organization'}
            {!pending && <ArrowRightIcon />}
          </Button>

          <p className="border-t border-rule pt-4 text-center text-sm text-ink-muted">
            Wrong account?{' '}
            <TextLink
              as="button"
              type="button"
              onClick={() => void signOut().then(() => window.location.assign('/login'))}
            >
              Sign out
            </TextLink>
          </p>
        </form>
      </AuthCard>
    </PublicFrame>
  );
}

function BuildingIcon() {
  return (
    <svg
      focusable="false"
      viewBox="0 0 24 24"
      className="h-7 w-7"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 10h4a1 1 0 0 1 1 1v10M3 21h18M8 8h3M8 12h3M8 16h3" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg
      focusable="false"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
    </svg>
  );
}
