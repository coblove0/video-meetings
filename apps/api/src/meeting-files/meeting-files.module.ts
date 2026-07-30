import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AuthModule } from '../auth/auth.module';
import { UploadMeetingFileHandler } from './commands/handlers/upload-meeting-file.handler';
import { MeetingFilesController } from './meeting-files.controller';

const CommandHandlers = [UploadMeetingFileHandler];

@Module({
  imports: [CqrsModule, AuthModule],
  controllers: [MeetingFilesController],
  providers: [...CommandHandlers],
})
export class MeetingFilesModule {}
