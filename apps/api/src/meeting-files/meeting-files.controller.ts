import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
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
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt-auth.guard';
import { MeetingFile } from '../generated/prisma';
import { DeleteMeetingFileCommand } from './commands/impl/delete-meeting-file.command';
import { UploadMeetingFileCommand } from './commands/impl/upload-meeting-file.command';
import { meetingFilesMulterOptions } from './multer.config';
import { DownloadMeetingFileQuery } from './queries/impl/download-meeting-file.query';
import { GetMeetingFilesQuery } from './queries/impl/get-meeting-files.query';

@UseGuards(JwtAuthGuard)
@Controller('meetings/:id/files')
export class MeetingFilesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

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

  @Get()
  findAll(
    @Param('id') meetingId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MeetingFile[]> {
    return this.queryBus.execute(
      new GetMeetingFilesQuery(meetingId, user.userId),
    );
  }

  @Get(':fileId/download')
  async download(
    @Param('id') meetingId: string,
    @Param('fileId') fileId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.queryBus.execute<
      DownloadMeetingFileQuery,
      MeetingFile
    >(new DownloadMeetingFileQuery(meetingId, fileId, user.userId));

    const asciiName = file.originalName.replace(/[^\x20-\x7E]/g, '_');
    res.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `attachment; filename="${asciiName.replace(/"/g, "'")}"; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
    });

    return new StreamableFile(createReadStream(file.storagePath));
  }

  @Delete(':fileId')
  @HttpCode(204)
  remove(
    @Param('id') meetingId: string,
    @Param('fileId') fileId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.commandBus.execute(
      new DeleteMeetingFileCommand(meetingId, fileId, user.userId),
    );
  }
}
