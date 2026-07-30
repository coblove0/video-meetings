import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AuthModule } from '../auth/auth.module';
import { DeleteMeetingFileHandler } from './commands/handlers/delete-meeting-file.handler';
import { UploadMeetingFileHandler } from './commands/handlers/upload-meeting-file.handler';
import { MeetingFilesController } from './meeting-files.controller';
import { DownloadMeetingFileHandler } from './queries/handlers/download-meeting-file.handler';
import { GetMeetingFilesHandler } from './queries/handlers/get-meeting-files.handler';

const CommandHandlers = [UploadMeetingFileHandler, DeleteMeetingFileHandler];
const QueryHandlers = [GetMeetingFilesHandler, DownloadMeetingFileHandler];

@Module({
  imports: [CqrsModule, AuthModule],
  controllers: [MeetingFilesController],
  providers: [...CommandHandlers, ...QueryHandlers],
})
export class MeetingFilesModule {}
