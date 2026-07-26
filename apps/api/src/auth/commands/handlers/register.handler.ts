import { CommandHandler, CommandBus, ICommandHandler } from '@nestjs/cqrs';
import * as bcrypt from 'bcrypt';
import { CreateUserCommand } from '../../../users/commands/impl/create-user.command';
import { User } from '../../../generated/prisma';
import { AuthTokenResponse, TokenService } from '../../token.service';
import { RegisterCommand } from '../impl/register.command';

const SALT_ROUNDS = 10;

@CommandHandler(RegisterCommand)
export class RegisterHandler implements ICommandHandler<
  RegisterCommand,
  AuthTokenResponse
> {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly tokenService: TokenService,
  ) {}

  async execute(command: RegisterCommand): Promise<AuthTokenResponse> {
    const passwordHash = await bcrypt.hash(command.password, SALT_ROUNDS);
    const user = await this.commandBus.execute<CreateUserCommand, User>(
      new CreateUserCommand(command.email, passwordHash),
    );

    return this.tokenService.issue(user.id, user.email);
  }
}
