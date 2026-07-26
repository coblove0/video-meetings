import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AuthModule } from '../auth/auth.module';
import { CreateMeetingHandler } from './commands/handlers/create-meeting.handler';
import { MeetingsController } from './meetings.controller';
import { GetMeetingHandler } from './queries/handlers/get-meeting.handler';
import { ListMeetingsHandler } from './queries/handlers/list-meetings.handler';

const CommandHandlers = [CreateMeetingHandler];
const QueryHandlers = [ListMeetingsHandler, GetMeetingHandler];

@Module({
  imports: [CqrsModule, AuthModule],
  controllers: [MeetingsController],
  providers: [...CommandHandlers, ...QueryHandlers],
})
export class MeetingsModule {}
