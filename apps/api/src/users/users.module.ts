import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AuthModule } from '../auth/auth.module';
import { CreateUserHandler } from './commands/handlers/create-user.handler';
import { UpdateProfileHandler } from './commands/handlers/update-profile.handler';
import { UploadAvatarHandler } from './commands/handlers/upload-avatar.handler';
import { FindUserByEmailHandler } from './queries/handlers/find-user-by-email.handler';
import { GetAvatarHandler } from './queries/handlers/get-avatar.handler';
import { GetCurrentUserHandler } from './queries/handlers/get-current-user.handler';
import { UsersController } from './users.controller';

const CommandHandlers = [
  CreateUserHandler,
  UpdateProfileHandler,
  UploadAvatarHandler,
];
const QueryHandlers = [
  FindUserByEmailHandler,
  GetCurrentUserHandler,
  GetAvatarHandler,
];

@Module({
  imports: [CqrsModule, AuthModule],
  controllers: [UsersController],
  providers: [...CommandHandlers, ...QueryHandlers],
})
export class UsersModule {}
