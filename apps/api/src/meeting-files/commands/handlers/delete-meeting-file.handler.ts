import { NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { unlink } from 'fs/promises';
import { PrismaService } from '../../../prisma/prisma.service';
import { DeleteMeetingFileCommand } from '../impl/delete-meeting-file.command';

@CommandHandler(DeleteMeetingFileCommand)
export class DeleteMeetingFileHandler implements ICommandHandler<
  DeleteMeetingFileCommand,
  void
> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: DeleteMeetingFileCommand): Promise<void> {
    const file = await this.prisma.meetingFile.findFirst({
      where: {
        id: command.fileId,
        meetingId: command.meetingId,
        meeting: { ownerId: command.ownerId },
      },
    });
    if (!file) {
      throw new NotFoundException('File not found');
    }

    await this.prisma.meetingFile.delete({ where: { id: file.id } });
    await unlink(file.storagePath).catch(() => undefined);
  }
}
