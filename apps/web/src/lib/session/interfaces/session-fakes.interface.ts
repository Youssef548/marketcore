import type { Mock } from 'vitest';
import type { SessionStore } from './session.interface';

/** A session store whose writes a spec can assert on. */
export interface FakeStore extends SessionStore {
  saveTokens: Mock;
  clear: Mock;
}

/** What a fake store holds before the spec runs. */
export interface FakeStoreSeed {
  access?: string;
  refresh?: string;
  organization?: string;
}
