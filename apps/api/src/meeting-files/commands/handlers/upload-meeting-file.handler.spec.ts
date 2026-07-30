import { NotFoundException } from '@nestjs/common';
import { unlink } from 'fs/promises';
import { PrismaService } from '../../../prisma/prisma.service';
import { UploadMeetingFileCommand } from '../impl/upload-meeting-file.command';
import { UploadMeetingFileHandler } from './upload-meeting-file.handler';

jest.mock('fs/promises', () => ({
  unlink: jest.fn().mockResolvedValue(undefined),
}));

describe('UploadMeetingFileHandler', () => {
  let handler: UploadMeetingFileHandler;
  let prisma: {
    meeting: { findFirst: jest.Mock };
    meetingFile: { create: jest.Mock };
  };

  const file = {
    path: '/tmp/uploads/abc.pdf',
    originalname: 'notes.pdf',
    mimetype: 'application/pdf',
    size: 1234,
  } as Express.Multer.File;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      meeting: { findFirst: jest.fn() },
      meetingFile: { create: jest.fn() },
    };
    handler = new UploadMeetingFileHandler(prisma as unknown as PrismaService);
  });

  it('saves the file metadata when the meeting belongs to the caller', async () => {
    prisma.meeting.findFirst.mockResolvedValue({ id: 'meeting-1' });
    prisma.meetingFile.create.mockResolvedValue({ id: 'file-1' });

    const command = new UploadMeetingFileCommand('meeting-1', 'owner-1', file);
    const result = await handler.execute(command);

    expect(prisma.meeting.findFirst).toHaveBeenCalledWith({
      where: { id: 'meeting-1', ownerId: 'owner-1' },
    });
    expect(prisma.meetingFile.create).toHaveBeenCalledWith({
      data: {
        originalName: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
        storagePath: file.path,
        meetingId: 'meeting-1',
      },
    });
    expect(unlink).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 'file-1' });
  });

  it('deletes the orphaned file and throws 404 when the meeting is not owned by the caller', async () => {
    prisma.meeting.findFirst.mockResolvedValue(null);

    const command = new UploadMeetingFileCommand('meeting-1', 'owner-1', file);

    await expect(handler.execute(command)).rejects.toThrow(NotFoundException);
    expect(unlink).toHaveBeenCalledWith(file.path);
    expect(prisma.meetingFile.create).not.toHaveBeenCalled();
  });
});
