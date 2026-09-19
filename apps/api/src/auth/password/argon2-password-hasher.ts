import { Injectable } from '@nestjs/common';
import { argon2id, hash, verify } from 'argon2';
import type { PasswordHasher } from './password-hasher.interface';

/**
 * argon2id, the current recommendation for password storage: memory-hard, so a
 * GPU farm does not get the advantage a bare SHA would give it.
 *
 * Refresh tokens deliberately do NOT come through here. They are 256 bits of
 * randomness, so there is nothing to brute-force and a slow KDF would only add
 * latency to every refresh. See TokenService.
 */
@Injectable()
export class Argon2PasswordHasher implements PasswordHasher {
  hash(plain: string): Promise<string> {
    return hash(plain, { type: argon2id });
  }

  verify(digest: string, plain: string): Promise<boolean> {
    return verify(digest, plain);
  }
}
