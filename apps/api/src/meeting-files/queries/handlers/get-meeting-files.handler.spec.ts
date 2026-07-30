import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { GetMeetingFilesQuery } from '../impl/get-meeting-files.query';
import { GetMeetingFilesHandler } from './get-meeting-files.handler';

describe('GetMeetingFilesHandler', () => {
  let handler: GetMeetingFilesHandler;
  let prisma: {
    meeting: { findFirst: jest.Mock };
    meetingFile: { findMany: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      meeting: { findFirst: jest.fn() },
      meetingFile: { findMany: jest.fn() },
    };
    handler = new GetMeetingFilesHandler(prisma as unknown as PrismaService);
  });

  it("returns the meeting's files when the caller owns the meeting", async () => {
    prisma.meeting.findFirst.mockResolvedValue({ id: 'meeting-1' });
    prisma.meetingFile.findMany.mockResolvedValue([{ id: 'file-1' }]);

    const query = new GetMeetingFilesQuery('meeting-1', 'owner-1');
    const result = await handler.execute(query);

    expect(prisma.meeting.findFirst).toHaveBeenCalledWith({
      where: { id: 'meeting-1', ownerId: 'owner-1' },
    });
    expect(prisma.meetingFile.findMany).toHaveBeenCalledWith({
      where: { meetingId: 'meeting-1' },
      orderBy: { createdAt: 'asc' },
    });
    expect(result).toEqual([{ id: 'file-1' }]);
  });

  it('throws 404 when the meeting is not owned by the caller', async () => {
    prisma.meeting.findFirst.mockResolvedValue(null);

    const query = new GetMeetingFilesQuery('meeting-1', 'owner-1');

    await expect(handler.execute(query)).rejects.toThrow(NotFoundException);
    expect(prisma.meetingFile.findMany).not.toHaveBeenCalled();
  });
});
