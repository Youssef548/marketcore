import { Argon2PasswordHasher } from './argon2-password-hasher';

describe('Argon2PasswordHasher', () => {
  const hasher = new Argon2PasswordHasher();

  it('produces a hash that is not the password', async () => {
    const hash = await hasher.hash('correct horse battery staple');

    expect(hash).not.toContain('correct horse');
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('verifies the right password and rejects the wrong one', async () => {
    const hash = await hasher.hash('correct horse battery staple');

    await expect(hasher.verify(hash, 'correct horse battery staple')).resolves.toBe(true);
    await expect(hasher.verify(hash, 'wrong horse battery staple')).resolves.toBe(false);
  });

  it('salts, so the same password hashes differently every time', async () => {
    const [first, second] = await Promise.all([hasher.hash('same'), hasher.hash('same')]);

    expect(first).not.toBe(second);
  });
});
