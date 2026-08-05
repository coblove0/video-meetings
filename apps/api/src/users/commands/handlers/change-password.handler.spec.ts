import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { PrismaService } from '../../../prisma/prisma.service';
import { ChangePasswordCommand } from '../impl/change-password.command';
import { ChangePasswordHandler } from './change-password.handler';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

describe('ChangePasswordHandler', () => {
  let handler: ChangePasswordHandler;
  let prisma: { user: { findUnique: jest.Mock; update: jest.Mock } };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = { user: { findUnique: jest.fn(), update: jest.fn() } };
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      passwordHash: 'old-hash',
    });
    handler = new ChangePasswordHandler(prisma as unknown as PrismaService);
  });

  it('hashes and saves the new password when the current password is correct', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');

    const command = new ChangePasswordCommand(
      'user-1',
      'Correct123!',
      'NewPassword123!',
    );
    await handler.execute(command);

    expect(bcrypt.compare).toHaveBeenCalledWith('Correct123!', 'old-hash');
    expect(bcrypt.hash).toHaveBeenCalledWith('NewPassword123!', 10);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { passwordHash: 'new-hash' },
    });
  });

  it('throws BadRequestException and leaves the password hash unchanged when the current password is wrong', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    const command = new ChangePasswordCommand(
      'user-1',
      'WrongPassword',
      'NewPassword123!',
    );

    await expect(handler.execute(command)).rejects.toThrow(BadRequestException);
    expect(bcrypt.hash).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('throws 404 and does not attempt a comparison or update when the user no longer exists', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const command = new ChangePasswordCommand(
      'user-1',
      'Correct123!',
      'NewPassword123!',
    );

    await expect(handler.execute(command)).rejects.toThrow(NotFoundException);
    expect(bcrypt.compare).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
