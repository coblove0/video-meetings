import { NotFoundException } from '@nestjs/common';
import { unlink } from 'fs/promises';
import { PrismaService } from '../../../prisma/prisma.service';
import { DeleteMeetingFileCommand } from '../impl/delete-meeting-file.command';
import { DeleteMeetingFileHandler } from './delete-meeting-file.handler';

jest.mock('fs/promises', () => ({
  unlink: jest.fn().mockResolvedValue(undefined),
}));

describe('DeleteMeetingFileHandler', () => {
  let handler: DeleteMeetingFileHandler;
  let prisma: {
    meetingFile: { findFirst: jest.Mock; delete: jest.Mock };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      meetingFile: { findFirst: jest.fn(), delete: jest.fn() },
    };
    handler = new DeleteMeetingFileHandler(prisma as unknown as PrismaService);
  });

  it('deletes the DB record and the file on disk when the caller owns the meeting', async () => {
    prisma.meetingFile.findFirst.mockResolvedValue({
      id: 'file-1',
      storagePath: '/tmp/uploads/abc.pdf',
    });
    prisma.meetingFile.delete.mockResolvedValue({ id: 'file-1' });

    const command = new DeleteMeetingFileCommand(
      'meeting-1',
      'file-1',
      'owner-1',
    );
    await handler.execute(command);

    expect(prisma.meetingFile.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'file-1',
        meetingId: 'meeting-1',
        meeting: { ownerId: 'owner-1' },
      },
    });
    expect(prisma.meetingFile.delete).toHaveBeenCalledWith({
      where: { id: 'file-1' },
    });
    expect(unlink).toHaveBeenCalledWith('/tmp/uploads/abc.pdf');
  });

  it('throws 404 and does not touch disk when the file does not belong to the caller', async () => {
    prisma.meetingFile.findFirst.mockResolvedValue(null);

    const command = new DeleteMeetingFileCommand(
      'meeting-1',
      'file-1',
      'owner-1',
    );

    await expect(handler.execute(command)).rejects.toThrow(NotFoundException);
    expect(prisma.meetingFile.delete).not.toHaveBeenCalled();
    expect(unlink).not.toHaveBeenCalled();
  });
});
