import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Meeting } from '../../../generated/prisma';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateMeetingCommand } from '../impl/create-meeting.command';

@CommandHandler(CreateMeetingCommand)
export class CreateMeetingHandler implements ICommandHandler<
  CreateMeetingCommand,
  Meeting
> {
  constructor(private readonly prisma: PrismaService) {}

  execute(command: CreateMeetingCommand): Promise<Meeting> {
    return this.prisma.meeting.create({
      data: {
        title: command.title,
        date: new Date(command.date),
        participants: command.participants,
        ownerId: command.ownerId,
      },
    });
  }
}
