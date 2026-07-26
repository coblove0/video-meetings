import { ConflictException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { User } from '../../../generated/prisma';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateUserCommand } from '../impl/create-user.command';

@CommandHandler(CreateUserCommand)
export class CreateUserHandler implements ICommandHandler<
  CreateUserCommand,
  User
> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: CreateUserCommand): Promise<User> {
    const existing = await this.prisma.user.findUnique({
      where: { email: command.email },
    });
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    return this.prisma.user.create({
      data: { email: command.email, passwordHash: command.passwordHash },
    });
  }
}
