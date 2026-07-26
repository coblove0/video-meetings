import { NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Meeting } from '../../../generated/prisma';
import { PrismaService } from '../../../prisma/prisma.service';
import { GetMeetingQuery } from '../impl/get-meeting.query';

@QueryHandler(GetMeetingQuery)
export class GetMeetingHandler implements IQueryHandler<
  GetMeetingQuery,
  Meeting
> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetMeetingQuery): Promise<Meeting> {
    const meeting = await this.prisma.meeting.findFirst({
      where: { id: query.id, ownerId: query.ownerId },
    });
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    return meeting;
  }
}
