import { z } from 'zod';

/**
 * What every process that touches the database needs. The API and the worker
 * each extend it (ADR 0001): the worker must not need a JWT secret to boot.
 */
export const DatabaseEnvSchema = z.object({
  APP_NAME: z.string().min(1).default('app'),
  DATABASE_URL: z.string().url(),
});

const EnvSchema = DatabaseEnvSchema.extend({
  PORT: z.coerce.number().int().positive().default(3001),
  WEB_URL: z.string().default('http://localhost:3000'),
  // Signs access tokens. A minimum length is enforced here because a short secret
  // is a forgery risk that no downstream check can repair.
  JWT_SECRET: z.string().min(32),
});

export type Env = z.infer<typeof EnvSchema>;

/** Validates `source` against `schema`, failing with every problem listed by path. */
export function parseEnv<S extends z.ZodType>(schema: S, source: NodeJS.ProcessEnv = process.env): z.output<S> {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment:\n${parsed.error.issues
        .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
        .join('\n')}`,
    );
  }
  return parsed.data;
}

export function validateEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return parseEnv(EnvSchema, source);
}
