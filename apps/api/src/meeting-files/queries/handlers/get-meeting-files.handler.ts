import { NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { MeetingFile } from '../../../generated/prisma';
import { PrismaService } from '../../../prisma/prisma.service';
import { GetMeetingFilesQuery } from '../impl/get-meeting-files.query';

@QueryHandler(GetMeetingFilesQuery)
export class GetMeetingFilesHandler implements IQueryHandler<
  GetMeetingFilesQuery,
  MeetingFile[]
> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetMeetingFilesQuery): Promise<MeetingFile[]> {
    const meeting = await this.prisma.meeting.findFirst({
      where: { id: query.meetingId, ownerId: query.ownerId },
    });
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    return this.prisma.meetingFile.findMany({
      where: { meetingId: query.meetingId },
      orderBy: { createdAt: 'asc' },
    });
  }
}
