import { NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { MeetingFile } from '../../../generated/prisma';
import { PrismaService } from '../../../prisma/prisma.service';
import { DownloadMeetingFileQuery } from '../impl/download-meeting-file.query';

@QueryHandler(DownloadMeetingFileQuery)
export class DownloadMeetingFileHandler implements IQueryHandler<
  DownloadMeetingFileQuery,
  MeetingFile
> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: DownloadMeetingFileQuery): Promise<MeetingFile> {
    const file = await this.prisma.meetingFile.findFirst({
      where: {
        id: query.fileId,
        meetingId: query.meetingId,
        meeting: { ownerId: query.ownerId },
      },
    });
    if (!file) {
      throw new NotFoundException('File not found');
    }

    return file;
  }
}
