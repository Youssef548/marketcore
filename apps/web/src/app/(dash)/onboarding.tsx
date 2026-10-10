'use client';

import { useState, type FormEvent } from 'react';
import { Alert, Button, Field } from '@app/ui';
import { createOrganization, signOut } from '@/lib/session/client';

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
 */
export function Onboarding({ onCreated }: { onCreated: () => Promise<void> }) {
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
    <main className="flex min-h-screen items-center justify-center bg-canvas px-6 py-12">
      <div className="w-full max-w-[26rem] rounded-[16px] border border-rule bg-panel p-7">
        <form className="space-y-5" onSubmit={submit} noValidate>
          <header className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">
              You&rsquo;re not in an organization yet
            </h1>
            <p className="text-sm text-ink-muted">
              MarketCore keeps products, orders and money inside an organization. Create one and you
              are its owner.
            </p>
          </header>

          {error !== null && <Alert>{error}</Alert>}

          <Field
            label="Organization name"
            name="name"
            autoComplete="organization"
            value={name}
            error={null}
            onChange={(event) => setName(event.target.value)}
          />

          {/* `busy` rather than `disabled`: a disabled submit button drops keyboard focus and
           * sends the user back to the top of the form mid-submit. */}
          <Button type="submit" busy={pending} className="w-full">
            {pending ? 'Creating…' : 'Create organization'}
          </Button>

          <p className="text-sm text-ink-muted">
            Wrong account?{' '}
            <button
              type="button"
              className="text-action underline"
              onClick={() => void signOut().then(() => window.location.assign('/login'))}
            >
              Sign out
            </button>
          </p>
        </form>
      </div>
    </main>
  );
}
