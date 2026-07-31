import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { GetCurrentUserQuery } from '../impl/get-current-user.query';
import { GetCurrentUserHandler } from './get-current-user.handler';

describe('GetCurrentUserHandler', () => {
  let handler: GetCurrentUserHandler;
  let prisma: { user: { findUnique: jest.Mock } };

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn() } };
    handler = new GetCurrentUserHandler(prisma as unknown as PrismaService);
  });

  it('returns the profile without passwordHash for the caller', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      name: 'Jane Doe',
      avatarPath: '/uploads/avatars/abc.jpg',
    });

    const query = new GetCurrentUserQuery('user-1');
    const result = await handler.execute(query);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { id: true, email: true, name: true, avatarPath: true },
    });
    expect(result).toEqual({
      id: 'user-1',
      email: 'user@example.com',
      name: 'Jane Doe',
      hasAvatar: true,
    });
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('reports hasAvatar as false when no avatar is set', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      name: null,
      avatarPath: null,
    });

    const result = await handler.execute(new GetCurrentUserQuery('user-1'));

    expect(result.hasAvatar).toBe(false);
  });

  it('throws 404 when the user no longer exists', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      handler.execute(new GetCurrentUserQuery('user-1')),
    ).rejects.toThrow(NotFoundException);
  });
});
