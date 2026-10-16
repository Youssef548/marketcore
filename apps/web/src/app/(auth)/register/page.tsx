'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PASSWORD_MIN_LENGTH, RegisterRequestSchema } from '@app/contracts';
import { Alert, ArrowRightIcon, Button, Field, PageHeading, TextLink } from '@app/ui';
import { messageFrom } from '@/lib/http/browser';

/**
 * Create an account.
 *
 * Registration returns a user and no tokens — the API keeps user creation and
 * signing in apart — so a success sends the visitor to the login page rather than
 * pretending they are now signed in.
 *
 * The password policy's minimum is stated from the same constant the domain checks
 * against, so the hint cannot drift from the rule — and the server's own refusal
 * remains the authority, arriving as a message if the client-side check is bypassed.
 */
export default function RegisterPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = RegisterRequestSchema.safeParse({ email, password });
    if (!parsed.success) {
      const collected: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? 'form');
        collected[field] ??= issue.message;
      }
      setFieldErrors(collected);
      return;
    }

    setFieldErrors({});
    setFormError(null);
    setPending(true);

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });

      if (response.status === 201) {
        router.replace('/login?registered=1');
        return;
      }

      setFormError(await messageFrom(response));
    } catch {
      setFormError('Could not reach the server');
    } finally {
      setPending(false);
    }
  }

  return (
    // The Stitch register screen (046): heading, email, password with its policy
    // stated beneath it, the action, then the way back to sign in.
    <form className="space-y-4" onSubmit={submit} noValidate>
      <div className="mb-6 space-y-1.5">
        <PageHeading>Create your account</PageHeading>
        <p className="text-sm text-ink-muted">You will be asked to sign in afterwards.</p>
      </div>

      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        size="lg"
        value={email}
        error={fieldErrors.email}
        onChange={(event) => setEmail(event.target.value)}
      />

      {/* The policy is the field's hint, so the input is described by it — a screen
       * reader hears the rule with the field rather than only if it goes looking. */}
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        size="lg"
        hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        value={password}
        error={fieldErrors.password}
        onChange={(event) => setPassword(event.target.value)}
      />

      {formError !== null && <Alert className="border-l-4">{formError}</Alert>}

      <Button type="submit" size="lg" busy={pending} className="w-full">
        {pending ? 'Creating…' : 'Create account'}
        {!pending && <ArrowRightIcon />}
      </Button>

      <p className="pt-2 text-center text-sm text-ink-muted">
        Already have one?{' '}
        <TextLink as={Link} href="/login">
          Sign in
        </TextLink>
      </p>
    </form>
  );
}
