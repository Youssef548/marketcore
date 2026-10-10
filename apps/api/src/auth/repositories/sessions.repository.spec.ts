import { SessionsRepository } from './sessions.repository';

/**
 * The conditional update is the whole reason rotation is safe, so it is asserted
 * directly rather than inferred from an e2e pass that may not interleave.
 */
describe('SessionsRepository.claimAndRotate', () => {
  const tx = {
    refreshToken: { updateMany: jest.fn(), create: jest.fn() },
    session: { update: jest.fn() },
  };
  const prisma = { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) } as never;

  beforeEach(() => jest.clearAllMocks());

  it('reports that it lost the race when the token was already claimed', async () => {
    // count 0 means another request set usedAt between our read and our write —
    // exactly the window the plain transaction leaves open.
    tx.refreshToken.updateMany.mockResolvedValue({ count: 0 });

    const repository = new SessionsRepository(prisma);

    await expect(
      repository.claimAndRotate('tok-1', 'session-1', 'new-hash', new Date()),
    ).resolves.toBe(false);
    expect(tx.refreshToken.create).not.toHaveBeenCalled();
  });

  it('guards the claim on the row still being unused', async () => {
    tx.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    tx.refreshToken.create.mockResolvedValue({});
    tx.session.update.mockResolvedValue({});

    await new SessionsRepository(prisma).claimAndRotate(
      'tok-1',
      'session-1',
      'new-hash',
      new Date(),
    );

    // The predicate is the race guard; a plain `where: { id }` would still pass
    // the other assertions while being unsafe.
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'tok-1', usedAt: null } }),
    );
  });

  it('rotates when it wins the claim', async () => {
    tx.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    tx.refreshToken.create.mockResolvedValue({});
    tx.session.update.mockResolvedValue({});

    await expect(
      new SessionsRepository(prisma).claimAndRotate('tok-1', 'session-1', 'new-hash', new Date()),
    ).resolves.toBe(true);
    expect(tx.refreshToken.create).toHaveBeenCalled();
  });
});
