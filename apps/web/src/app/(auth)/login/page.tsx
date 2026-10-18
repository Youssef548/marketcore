'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { LoginRequestSchema } from '@app/contracts';
import { Alert, AlertVariants, ArrowRightIcon, Button, ControlSizes, Field, PageHeading, TextLink } from '@app/ui';
import { firstIssuePerField } from '@/lib/forms/issues';
import { postJson } from '@/lib/forms/post-json';
import { safeRedirect } from '@/lib/http/browser';
import { STOREFRONT_PATH } from '@/lib/session/routing';

/**
 * Sign in.
 *
 * The form validates with `LoginRequestSchema` — the same schema the API validates
 * the body with, and the reason `@app/contracts` is a package rather than a
 * convention. A malformed email is refused before a round trip, and what the API
 * would have said about it is what is shown.
 *
 * Each field is a `Field`, which is what links the input to the message that
 * explains a refusal. Rendering the two side by side was four fields wrong in the
 * same way.
 */
function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = LoginRequestSchema.safeParse({ email, password });
    if (!parsed.success) {
      setFieldErrors(firstIssuePerField(parsed.error.issues));
      return;
    }

    setFieldErrors({});
    setFormError(null);
    setPending(true);

    const result = await postJson('/api/auth/login', parsed.data, 204);
    setPending(false);

    if (result.ok) {
      // `next` is attacker-controllable, so it is constrained to this site — and the
      // path a visitor lands on when there is nothing to return to is named here,
      // because this page is what sends them there.
      router.replace(safeRedirect(params.get('next'), STOREFRONT_PATH));
      return;
    }

    setFormError(result.message);
  }

  return (
    // The Stitch sign-in screen (040), error state included: heading, two fields, the
    // refusal as a banner between the fields and the action, then the way to register.
    <form className="space-y-4" onSubmit={submit} noValidate>
      <div className="mb-6 space-y-1.5">
        <PageHeading>Sign in</PageHeading>
        <p className="text-sm text-ink-muted">Use the account you registered.</p>
      </div>

      {params.get('registered') === '1' && (
        <Alert variant={AlertVariants.SUCCESS}>Account created. Sign in to continue.</Alert>
      )}

      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        size={ControlSizes.LG}
        value={email}
        error={fieldErrors.email}
        onChange={(event) => setEmail(event.target.value)}
      />

      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        size={ControlSizes.LG}
        value={password}
        error={fieldErrors.password}
        onChange={(event) => setPassword(event.target.value)}
      />

      {/* Below the fields, where the design puts it, so it is read in order with the
       * button it explains. The leading edge is the design's: the same attention
       * colour as the border, thicker, so the banner reads as a refusal at a glance. */}
      {formError !== null && <Alert className="border-l-4">{formError}</Alert>}

      {/* `busy` rather than `disabled`: a disabled submit button drops keyboard
       * focus and sends the user back to the top of the form mid-submit. */}
      <Button type="submit" size={ControlSizes.LG} busy={pending} className="w-full">
        {pending ? 'Signing in…' : 'Sign in'}
        {!pending && <ArrowRightIcon />}
      </Button>

      <p className="pt-2 text-center text-sm text-ink-muted">
        No account?{' '}
        <TextLink as={Link} href="/register">
          Create one
        </TextLink>
      </p>
    </form>
  );
}

export default function LoginPage() {
  // `useSearchParams` needs a Suspense boundary above it, or the route cannot be
  // prerendered and the build fails rather than warns.
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
