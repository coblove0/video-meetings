import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { RegisterCommand } from './commands/impl/register.command';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { LoginQuery } from './queries/impl/login.query';
import { AuthTokenResponse } from './token.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post('register')
  register(@Body() dto: RegisterDto): Promise<AuthTokenResponse> {
    return this.commandBus.execute(
      new RegisterCommand(dto.email, dto.password),
    );
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<AuthTokenResponse> {
    return this.queryBus.execute(new LoginQuery(dto.email, dto.password));
  }
}
