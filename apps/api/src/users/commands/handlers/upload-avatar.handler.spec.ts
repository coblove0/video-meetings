import {
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { readFile, unlink } from 'fs/promises';
import type { PrismaService } from '../../../prisma/prisma.service';
import { UploadAvatarCommand } from '../impl/upload-avatar.command';
import { UploadAvatarHandler } from './upload-avatar.handler';

jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

const JPEG_MAGIC_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const INVALID_MAGIC_BYTES = Buffer.from('not an image');

describe('UploadAvatarHandler', () => {
  let handler: UploadAvatarHandler;
  let tx: { $queryRaw: jest.Mock; user: { update: jest.Mock } };
  let prisma: { $transaction: jest.Mock };

  const file = {
    path: '/tmp/avatars/new-avatar.jpg',
    originalname: 'photo.jpg',
    mimetype: 'image/jpeg',
    size: 1234,
  } as Express.Multer.File;

  beforeEach(() => {
    jest.clearAllMocks();
    (readFile as jest.Mock).mockResolvedValue(JPEG_MAGIC_BYTES);
    tx = {
      $queryRaw: jest.fn(),
      user: { update: jest.fn() },
    };
    prisma = {
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback(tx),
      ),
    };
    handler = new UploadAvatarHandler(prisma as unknown as PrismaService);
  });

  it('saves the new avatar path and mime type when there is no previous avatar', async () => {
    tx.$queryRaw.mockResolvedValue([{ avatarPath: null }]);
    tx.user.update.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      name: 'Jane Doe',
    });

    const command = new UploadAvatarCommand('user-1', file);
    const result = await handler.execute(command);

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { avatarPath: file.path, avatarMimeType: file.mimetype },
      select: { id: true, email: true, name: true },
    });
    expect(unlink).not.toHaveBeenCalled();
    expect(result).toEqual({
      id: 'user-1',
      email: 'user@example.com',
      name: 'Jane Doe',
      hasAvatar: true,
    });
  });

  it('replaces an existing avatar: writes the new path to the DB before unlinking the old file', async () => {
    tx.$queryRaw.mockResolvedValue([
      { avatarPath: '/tmp/avatars/old-avatar.png' },
    ]);
    tx.user.update.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      name: 'Jane Doe',
    });

    const command = new UploadAvatarCommand('user-1', file);
    await handler.execute(command);

    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { avatarPath: file.path, avatarMimeType: file.mimetype },
      }),
    );
    expect(unlink).toHaveBeenCalledWith('/tmp/avatars/old-avatar.png');

    const updateOrder = tx.user.update.mock.invocationCallOrder[0];
    const unlinkOrder = (unlink as jest.Mock).mock.invocationCallOrder[0];
    expect(updateOrder).toBeLessThan(unlinkOrder);
  });

  it('rejects a file whose content does not match its declared image type and deletes it', async () => {
    (readFile as jest.Mock).mockResolvedValue(INVALID_MAGIC_BYTES);

    const command = new UploadAvatarCommand('user-1', file);

    await expect(handler.execute(command)).rejects.toThrow(
      UnsupportedMediaTypeException,
    );
    expect(unlink).toHaveBeenCalledWith(file.path);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a file whose signature does not match the declared Content-Type and deletes it', async () => {
    const pngBytesDeclaredAsJpeg = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    (readFile as jest.Mock).mockResolvedValue(pngBytesDeclaredAsJpeg);

    const command = new UploadAvatarCommand('user-1', file);

    await expect(handler.execute(command)).rejects.toThrow(
      UnsupportedMediaTypeException,
    );
    expect(unlink).toHaveBeenCalledWith(file.path);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('deletes the orphaned file and throws 404 when the user no longer exists', async () => {
    tx.$queryRaw.mockResolvedValue([]);

    const command = new UploadAvatarCommand('user-1', file);

    await expect(handler.execute(command)).rejects.toThrow(NotFoundException);
    expect(unlink).toHaveBeenCalledWith(file.path);
    expect(tx.user.update).not.toHaveBeenCalled();
  });
});
