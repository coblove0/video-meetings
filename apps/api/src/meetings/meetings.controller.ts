import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Meeting } from '../generated/prisma';
import { CreateMeetingCommand } from './commands/impl/create-meeting.command';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { GetMeetingQuery } from './queries/impl/get-meeting.query';
import { ListMeetingsQuery } from './queries/impl/list-meetings.query';

@UseGuards(JwtAuthGuard)
@Controller('meetings')
export class MeetingsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  create(
    @Body() dto: CreateMeetingDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Meeting> {
    return this.commandBus.execute(
      new CreateMeetingCommand(
        user.userId,
        dto.title,
        dto.date,
        dto.participants,
      ),
    );
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser): Promise<Meeting[]> {
    return this.queryBus.execute(new ListMeetingsQuery(user.userId));
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Meeting> {
    return this.queryBus.execute(new GetMeetingQuery(id, user.userId));
  }
}
