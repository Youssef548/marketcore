import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ replace: vi.fn(), get: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => ({ get: mocks.get }),
}));

import LoginPage from './page';

const fetchMock = vi.fn();

beforeEach(() => {
  mocks.replace.mockClear();
  mocks.get.mockReset();
  mocks.get.mockReturnValue(null);
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function fillIn(email: string, password: string) {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

/** Enough of a Response for the form's two branches: a status and a JSON body. */
const response = (status: number, body: unknown) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
});

const envelope = (message: string) => ({
  error: { code: 'UNAUTHORIZED', message, requestId: 'req_1' },
});

describe('the sign-in form', () => {
  it('refuses a malformed email without asking the server', async () => {
    // The same schema the API validates with, checked here first — which is the
    // point of contracts being a package rather than a convention.
    render(<LoginPage />);
    fillIn('not-an-email', 'correct-horse-battery');
    submit();

    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows what the server said when the credentials are refused', async () => {
    fetchMock.mockResolvedValue(response(401, envelope('Invalid credentials')));

    render(<LoginPage />);
    fillIn('owner@marketcore.test', 'wrong-horse-battery');
    submit();

    await waitFor(() => expect(screen.getByText('Invalid credentials')).toBeTruthy());
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('goes where it was asked to go when the sign-in succeeds', async () => {
    mocks.get.mockImplementation((key: string) => (key === 'next' ? '/dashboard/orders' : null));
    fetchMock.mockResolvedValue(response(204, null));

    render(<LoginPage />);
    fillIn('owner@marketcore.test', 'correct-horse-battery');
    submit();

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/dashboard/orders'));
  });

  it('refuses to be redirected off this site, however it was asked', async () => {
    // `?next=` arrives from a URL, so it is attacker-controllable. An unvalidated
    // value here is an open redirect straight off the back of a successful sign-in.
    mocks.get.mockImplementation((key: string) => (key === 'next' ? 'https://evil.test' : null));
    fetchMock.mockResolvedValue(response(204, null));

    render(<LoginPage />);
    fillIn('owner@marketcore.test', 'correct-horse-battery');
    submit();

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/dashboard'));
  });

  it('reports a server it cannot reach rather than failing silently', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    render(<LoginPage />);
    fillIn('owner@marketcore.test', 'correct-horse-battery');
    submit();

    await waitFor(() => expect(screen.getByText('Could not reach the server')).toBeTruthy());
  });

  it('associates a refused field with the message that says why', async () => {
    render(<LoginPage />);
    fillIn('not-an-email', 'correct-horse-battery');
    submit();

    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));

    const email = screen.getByLabelText('Email');
    const describedBy = email.getAttribute('aria-describedby');
    expect(describedBy, 'the field error is described, not merely adjacent').toBeTruthy();
    expect(document.getElementById(describedBy as string)?.textContent).toBeTruthy();
  });
});
