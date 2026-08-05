import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../prisma/prisma.service';
import { ChangePasswordCommand } from '../impl/change-password.command';

const SALT_ROUNDS = 10;

@CommandHandler(ChangePasswordCommand)
export class ChangePasswordHandler implements ICommandHandler<
  ChangePasswordCommand,
  void
> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: ChangePasswordCommand): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: command.userId },
      select: { passwordHash: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isCurrentPasswordValid = await bcrypt.compare(
      command.currentPassword,
      user.passwordHash,
    );
    if (!isCurrentPasswordValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(command.newPassword, SALT_ROUNDS);
    await this.prisma.user.update({
      where: { id: command.userId },
      data: { passwordHash },
    });
  }
}
