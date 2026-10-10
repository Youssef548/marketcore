/**
 * A port, so the hashing algorithm is a detail nothing above it depends on.
 *
 * Named here rather than beside the adapter because a second implementation — a
 * faster one for tests, or a migration to a different cost parameter — is
 * foreseeable in a way the conventions' Rule 3 anticipates.
 */
export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(hash: string, plain: string): Promise<boolean>;
}
