import {
  BadRequestException,
  Controller,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt-auth.guard';
import { MeetingFile } from '../generated/prisma';
import { UploadMeetingFileCommand } from './commands/impl/upload-meeting-file.command';
import { meetingFilesMulterOptions } from './multer.config';

@UseGuards(JwtAuthGuard)
@Controller('meetings/:id/files')
export class MeetingFilesController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', meetingFilesMulterOptions))
  upload(
    @Param('id') meetingId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MeetingFile> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    return this.commandBus.execute(
      new UploadMeetingFileCommand(meetingId, user.userId, file),
    );
  }
}
