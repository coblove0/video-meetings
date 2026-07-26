import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Meeting } from '../../../generated/prisma';
import { PrismaService } from '../../../prisma/prisma.service';
import { ListMeetingsQuery } from '../impl/list-meetings.query';

@QueryHandler(ListMeetingsQuery)
export class ListMeetingsHandler implements IQueryHandler<
  ListMeetingsQuery,
  Meeting[]
> {
  constructor(private readonly prisma: PrismaService) {}

  execute(query: ListMeetingsQuery): Promise<Meeting[]> {
    return this.prisma.meeting.findMany({
      where: { ownerId: query.ownerId },
    });
  }
}
