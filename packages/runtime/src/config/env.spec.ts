import { describe, expect, it } from 'vitest';
import { DatabaseEnvSchema, parseEnv, validateEnv } from './env';

/**
 * Passing an explicit source object keeps this a pure function test — no
 * mutation of process.env, no leakage between cases.
 *
 * Ported from apps/api when validation moved into @app/runtime, so the worker
 * fails at boot with the same list of bad fields the API does.
 */
const valid = {
  APP_NAME: 'marketcore',
  DATABASE_URL: 'postgresql://app:app@localhost:5432/app',
  PORT: '3001',
  WEB_URL: 'http://localhost:3000',
  JWT_SECRET: 'ci-secret-that-is-at-least-32-characters',
};

describe('validateEnv', () => {
  it('accepts a valid environment', () => {
    const env = validateEnv(valid);
    expect(env.DATABASE_URL).toBe(valid.DATABASE_URL);
    expect(env.PORT).toBe(3001);
  });

  it('applies defaults for everything optional', () => {
    const env = validateEnv({ DATABASE_URL: valid.DATABASE_URL, JWT_SECRET: valid.JWT_SECRET });
    expect(env.PORT).toBe(3001);
    expect(env.APP_NAME).toBe('app');
    expect(env.WEB_URL).toBe('http://localhost:3000');
  });

  it('fails fast and names every invalid field', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
    expect(() => validateEnv({ ...valid, DATABASE_URL: 'not-a-url' })).toThrow(/DATABASE_URL/);
    expect(() => validateEnv({ ...valid, PORT: '-1' })).toThrow(/PORT/);
  });

  it('reports every bad field at once rather than only the first', () => {
    expect(() => validateEnv({ DATABASE_URL: 'nope', PORT: '-1' })).toThrow(/DATABASE_URL[\s\S]*PORT/);
  });

  it('coerces PORT from the string an environment variable always is', () => {
    expect(validateEnv({ ...valid, PORT: '4567' }).PORT).toBe(4567);
  });
});

describe('DatabaseEnvSchema and parseEnv', () => {
  const database = { DATABASE_URL: 'postgresql://app:app@localhost:5432/app' };

  it('needs only what a database-only process needs — no signing secret', () => {
    expect(parseEnv(DatabaseEnvSchema, database)).toEqual({ ...database, APP_NAME: 'app' });
  });

  it('lists every problem at once, by path', () => {
    expect(() => parseEnv(DatabaseEnvSchema, {})).toThrow(/DATABASE_URL/);
  });

  it('leaves validateEnv as strict as it was: the API still needs JWT_SECRET', () => {
    expect(() => validateEnv(database)).toThrow(/JWT_SECRET/);
  });
});
