/**
 * A user row as the auth module needs it, including the hash.
 *
 * Declared in its own file rather than beside `AuthRepository`, so importing the
 * type does not mean importing the implementation that produces it.
 */
export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
}
