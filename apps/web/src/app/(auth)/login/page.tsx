'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { LoginRequestSchema } from '@app/contracts';
import { Alert, Button, Input, Label } from '@app/ui';
import { messageFrom, safeRedirect } from '@/lib/http/browser';

/**
 * Sign in.
 *
 * The form validates with `LoginRequestSchema` — the same schema the API validates
 * the body with, and the reason `@app/contracts` is a package rather than a
 * convention. A malformed email is refused before a round trip, and what the API
 * would have said about it is what is shown.
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
      setFieldErrors(collectIssues(parsed.error.issues));
      return;
    }

    setFieldErrors({});
    setFormError(null);
    setPending(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });

      if (response.status === 204) {
        // `next` is attacker-controllable, so it is constrained to this site.
        router.replace(safeRedirect(params.get('next')));
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
    <form className="space-y-5" onSubmit={submit} noValidate>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-gray-600">Use the account you registered.</p>
      </header>

      {params.get('registered') === '1' && (
        <Alert variant="success">Account created. Sign in to continue.</Alert>
      )}

      {formError !== null && <Alert>{formError}</Alert>}

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          invalid={fieldErrors.email !== undefined}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Alert>{fieldErrors.email}</Alert>
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          invalid={fieldErrors.password !== undefined}
          onChange={(event) => setPassword(event.target.value)}
        />
        <Alert>{fieldErrors.password}</Alert>
      </div>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>

      <p className="text-sm text-gray-600">
        No account?{' '}
        <Link className="text-brand-700 underline" href="/register">
          Create one
        </Link>
      </p>
    </form>
  );
}

/** The first message per field, which is the one a person reads. */
function collectIssues(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const collected: Record<string, string> = {};

  for (const issue of issues) {
    const field = String(issue.path[0] ?? 'form');
    collected[field] ??= issue.message;
  }

  return collected;
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
