import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { UpdateProfileCommand } from './commands/impl/update-profile.command';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { GetCurrentUserQuery } from './queries/impl/get-current-user.query';
import { UserProfileResponse } from './user-profile.response';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get('me')
  getCurrentUser(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserProfileResponse> {
    return this.queryBus.execute(new GetCurrentUserQuery(user.userId));
  }

  @Patch('me')
  updateProfile(
    @Body() dto: UpdateProfileDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserProfileResponse> {
    return this.commandBus.execute(
      new UpdateProfileCommand(user.userId, dto.name),
    );
  }
}
