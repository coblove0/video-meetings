import { NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { unlink } from 'fs/promises';
import { MeetingFile } from '../../../generated/prisma';
import { PrismaService } from '../../../prisma/prisma.service';
import { UploadMeetingFileCommand } from '../impl/upload-meeting-file.command';

@CommandHandler(UploadMeetingFileCommand)
export class UploadMeetingFileHandler implements ICommandHandler<
  UploadMeetingFileCommand,
  MeetingFile
> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: UploadMeetingFileCommand): Promise<MeetingFile> {
    const meeting = await this.prisma.meeting.findFirst({
      where: { id: command.meetingId, ownerId: command.ownerId },
    });
    if (!meeting) {
      await unlink(command.file.path).catch(() => undefined);
      throw new NotFoundException('Meeting not found');
    }

    return this.prisma.meetingFile.create({
      data: {
        originalName: command.file.originalname,
        size: command.file.size,
        mimeType: command.file.mimetype,
        storagePath: command.file.path,
        meetingId: command.meetingId,
      },
    });
  }
}
