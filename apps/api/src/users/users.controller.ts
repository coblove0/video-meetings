import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Patch,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { FileInterceptor } from '@nestjs/platform-express';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AvatarFile } from './avatar-file.response';
import { avatarMulterOptions } from './avatar-multer.config';
import { UpdateProfileCommand } from './commands/impl/update-profile.command';
import { UploadAvatarCommand } from './commands/impl/upload-avatar.command';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { GetAvatarQuery } from './queries/impl/get-avatar.query';
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

  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('file', avatarMulterOptions))
  uploadAvatar(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserProfileResponse> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    return this.commandBus.execute(new UploadAvatarCommand(user.userId, file));
  }

  @Get('me/avatar')
  async getAvatar(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const avatar = await this.queryBus.execute<GetAvatarQuery, AvatarFile>(
      new GetAvatarQuery(user.userId),
    );

    try {
      await stat(avatar.path);
    } catch {
      throw new NotFoundException('Avatar not found');
    }

    res.set({
      'Content-Type': avatar.mimeType,
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=0, must-revalidate',
    });

    return new StreamableFile(createReadStream(avatar.path));
  }
}
