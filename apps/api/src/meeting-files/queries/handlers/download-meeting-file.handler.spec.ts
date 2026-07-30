import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { DownloadMeetingFileQuery } from '../impl/download-meeting-file.query';
import { DownloadMeetingFileHandler } from './download-meeting-file.handler';

describe('DownloadMeetingFileHandler', () => {
  let handler: DownloadMeetingFileHandler;
  let prisma: { meetingFile: { findFirst: jest.Mock } };

  beforeEach(() => {
    prisma = { meetingFile: { findFirst: jest.fn() } };
    handler = new DownloadMeetingFileHandler(
      prisma as unknown as PrismaService,
    );
  });

  it('returns the file when the caller owns the meeting', async () => {
    prisma.meetingFile.findFirst.mockResolvedValue({ id: 'file-1' });

    const query = new DownloadMeetingFileQuery(
      'meeting-1',
      'file-1',
      'owner-1',
    );
    const result = await handler.execute(query);

    expect(prisma.meetingFile.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'file-1',
        meetingId: 'meeting-1',
        meeting: { ownerId: 'owner-1' },
      },
    });
    expect(result).toEqual({ id: 'file-1' });
  });

  it('throws 404 when the file does not belong to the caller', async () => {
    prisma.meetingFile.findFirst.mockResolvedValue(null);

    const query = new DownloadMeetingFileQuery(
      'meeting-1',
      'file-1',
      'owner-1',
    );

    await expect(handler.execute(query)).rejects.toThrow(NotFoundException);
  });
});
