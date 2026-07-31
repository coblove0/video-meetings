import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { UpdateProfileCommand } from '../impl/update-profile.command';
import { UpdateProfileHandler } from './update-profile.handler';

describe('UpdateProfileHandler', () => {
  let handler: UpdateProfileHandler;
  let prisma: { user: { findUnique: jest.Mock; update: jest.Mock } };

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn(), update: jest.fn() } };
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    handler = new UpdateProfileHandler(prisma as unknown as PrismaService);
  });

  it('updates the name for the caller and returns the profile without passwordHash', async () => {
    prisma.user.update.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      name: 'Jane Doe',
      avatarPath: null,
    });

    const command = new UpdateProfileCommand('user-1', 'Jane Doe');
    const result = await handler.execute(command);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { name: 'Jane Doe' },
      select: { id: true, email: true, name: true, avatarPath: true },
    });
    expect(result).toEqual({
      id: 'user-1',
      email: 'user@example.com',
      name: 'Jane Doe',
      hasAvatar: false,
    });
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('trims surrounding whitespace from the name before saving', async () => {
    prisma.user.update.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      name: 'Jane Doe',
      avatarPath: null,
    });

    const command = new UpdateProfileCommand('user-1', '  Jane Doe  ');
    await handler.execute(command);

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: 'Jane Doe' } }),
    );
  });

  it('treats a blank name as clearing it to null', async () => {
    prisma.user.update.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      name: null,
      avatarPath: null,
    });

    const command = new UpdateProfileCommand('user-1', '   ');
    await handler.execute(command);

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: null } }),
    );
  });

  it('only updates the caller identified by userId from the JWT', async () => {
    prisma.user.update.mockResolvedValue({
      id: 'user-2',
      email: 'other@example.com',
      name: 'Other User',
      avatarPath: null,
    });

    const command = new UpdateProfileCommand('user-2', 'Other User');
    await handler.execute(command);

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-2' } }),
    );
  });

  it('throws 404 and does not attempt an update when the user no longer exists', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const command = new UpdateProfileCommand('user-1', 'Jane Doe');

    await expect(handler.execute(command)).rejects.toThrow(NotFoundException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
