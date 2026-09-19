'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RegisterRequestSchema } from '@app/contracts';
import { Alert, Button, Field } from '@app/ui';
import { messageFrom } from '@/lib/http/browser';

/**
 * Create an account.
 *
 * Registration returns a user and no tokens — the API keeps user creation and
 * signing in apart — so a success sends the visitor to the login page rather than
 * pretending they are now signed in.
 *
 * The password policy is not restated here. It lives in `@app/domain` on the server
 * and its refusal comes back as a message, which is the one place it can be trusted
 * to be current.
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
    <form className="space-y-5" onSubmit={submit} noValidate>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Create an account</h1>
        <p className="text-sm text-ink-muted">You will be asked to sign in afterwards.</p>
      </header>

      {formError !== null && <Alert>{formError}</Alert>}

      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        value={email}
        error={fieldErrors.email}
        onChange={(event) => setEmail(event.target.value)}
      />

      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        value={password}
        error={fieldErrors.password}
        onChange={(event) => setPassword(event.target.value)}
      />

      <Button type="submit" busy={pending} className="w-full">
        {pending ? 'Creating…' : 'Create account'}
      </Button>

      <p className="text-sm text-ink-muted">
        Already registered?{' '}
        <Link className="text-action underline" href="/login">
          Sign in
        </Link>
      </p>
    </form>
  );
}
