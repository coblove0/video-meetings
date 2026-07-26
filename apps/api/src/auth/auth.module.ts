import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtModule } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { AuthController } from './auth.controller';
import { RegisterHandler } from './commands/handlers/register.handler';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LoginHandler } from './queries/handlers/login.handler';
import { TokenService } from './token.service';

const CommandHandlers = [RegisterHandler];
const QueryHandlers = [LoginHandler];

const jwtModule = JwtModule.registerAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    secret: config.get<string>('JWT_SECRET'),
    signOptions: {
      expiresIn: config.get<string>('JWT_EXPIRES_IN', '1h') as StringValue,
    },
  }),
});

@Module({
  imports: [CqrsModule, jwtModule],
  controllers: [AuthController],
  providers: [TokenService, JwtAuthGuard, ...CommandHandlers, ...QueryHandlers],
  exports: [JwtAuthGuard, jwtModule],
})
export class AuthModule {}
