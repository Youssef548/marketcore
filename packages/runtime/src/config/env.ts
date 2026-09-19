import { z } from 'zod';

/**
 * Validated once, at boot, so a misconfigured deploy fails immediately with a
 * list of what is wrong instead of throwing somewhere deep in a request.
 *
 * Shared by the API and the worker, which is why it lives in a package: neither
 * app may import the other.
 */
const EnvSchema = z.object({
  APP_NAME: z.string().min(1).default('app'),
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(3001),
  WEB_URL: z.string().default('http://localhost:3000'),
  // Signs access tokens. A minimum length is enforced here because a short secret
  // is a forgery risk that no downstream check can repair.
  JWT_SECRET: z.string().min(32),
});

export type Env = z.infer<typeof EnvSchema>;

export function validateEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment:\n${parsed.error.issues
        .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
        .join('\n')}`,
    );
  }
  return parsed.data;
}
