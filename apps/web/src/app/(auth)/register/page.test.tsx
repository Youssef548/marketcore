import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ replace: mocks.replace }),
}));

import RegisterPage from './page';

const fetchMock = vi.fn();

beforeEach(() => {
  mocks.replace.mockClear();
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

const response = (status: number, body: unknown) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
});

describe('the registration form', () => {
  it('sends a new account to sign in, rather than into a session', async () => {
    // Registration returns a user and no tokens — the API keeps user creation and
    // signing in apart, and this route does not chain a login to hide that.
    fetchMock.mockResolvedValue(response(201, { id: 'u1', email: 'new@marketcore.test' }));

    render(<RegisterPage />);
    fillIn('new@marketcore.test', 'a-long-enough-password');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/login?registered=1'));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/auth/register');
    expect(JSON.parse(String(init.body))).toEqual({
      email: 'new@marketcore.test',
      password: 'a-long-enough-password',
    });
  });

  it('shows the policy the server refused with, rather than one of its own', async () => {
    // The password rule lives in @app/domain and is not restated in the browser, so
    // this is the only place it can be trusted to be current.
    fetchMock.mockResolvedValue(
      response(400, {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Password is shorter than the minimum length',
          requestId: 'req_1',
        },
      }),
    );

    render(<RegisterPage />);
    fillIn('new@marketcore.test', 'short');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() =>
      expect(screen.getByText('Password is shorter than the minimum length')).toBeTruthy(),
    );
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('reports a duplicate email as the server names it', async () => {
    fetchMock.mockResolvedValue(
      response(409, {
        error: {
          code: 'CONFLICT',
          message: 'Email is already registered',
          requestId: 'req_2',
        },
      }),
    );

    render(<RegisterPage />);
    fillIn('taken@marketcore.test', 'a-long-enough-password');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(screen.getByText('Email is already registered')).toBeTruthy());
  });
});
