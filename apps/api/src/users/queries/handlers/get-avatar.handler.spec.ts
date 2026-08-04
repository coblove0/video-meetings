import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../../prisma/prisma.service';
import { GetAvatarQuery } from '../impl/get-avatar.query';
import { GetAvatarHandler } from './get-avatar.handler';

describe('GetAvatarHandler', () => {
  let handler: GetAvatarHandler;
  let prisma: { user: { findUnique: jest.Mock } };

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn() } };
    handler = new GetAvatarHandler(prisma as unknown as PrismaService);
  });

  it('returns the avatar path and mime type for the caller', async () => {
    prisma.user.findUnique.mockResolvedValue({
      avatarPath: '/uploads/avatars/abc.jpg',
      avatarMimeType: 'image/jpeg',
    });

    const query = new GetAvatarQuery('user-1');
    const result = await handler.execute(query);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { avatarPath: true, avatarMimeType: true },
    });
    expect(result).toEqual({
      path: '/uploads/avatars/abc.jpg',
      mimeType: 'image/jpeg',
    });
  });

  it('throws 404 when the user has not uploaded an avatar', async () => {
    prisma.user.findUnique.mockResolvedValue({
      avatarPath: null,
      avatarMimeType: null,
    });

    await expect(handler.execute(new GetAvatarQuery('user-1'))).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws 404 when the user no longer exists', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(handler.execute(new GetAvatarQuery('user-1'))).rejects.toThrow(
      NotFoundException,
    );
  });
});
