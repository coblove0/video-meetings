import { ConflictException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthTokenResponse, TokenService } from '../../token.service';
import { RegisterCommand } from '../impl/register.command';

const SALT_ROUNDS = 10;

@CommandHandler(RegisterCommand)
export class RegisterHandler implements ICommandHandler<
  RegisterCommand,
  AuthTokenResponse
> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
  ) {}

  async execute(command: RegisterCommand): Promise<AuthTokenResponse> {
    const existing = await this.prisma.user.findUnique({
      where: { email: command.email },
    });
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await bcrypt.hash(command.password, SALT_ROUNDS);
    const user = await this.prisma.user.create({
      data: { email: command.email, passwordHash },
    });

    return this.tokenService.issue(user.id, user.email);
  }
}
