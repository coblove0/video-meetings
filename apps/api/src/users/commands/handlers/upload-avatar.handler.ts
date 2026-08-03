import {
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { readFile, unlink } from 'fs/promises';
import { PrismaService } from '../../../prisma/prisma.service';
import { UserProfileResponse } from '../../user-profile.response';
import { UploadAvatarCommand } from '../impl/upload-avatar.command';

const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function hasValidImageSignature(content: Buffer): boolean {
  return (
    content.subarray(0, JPEG_SIGNATURE.length).equals(JPEG_SIGNATURE) ||
    content.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
  );
}

@CommandHandler(UploadAvatarCommand)
export class UploadAvatarHandler implements ICommandHandler<
  UploadAvatarCommand,
  UserProfileResponse
> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: UploadAvatarCommand): Promise<UserProfileResponse> {
    const content = await readFile(command.file.path);
    if (!hasValidImageSignature(content)) {
      await unlink(command.file.path).catch(() => undefined);
      throw new UnsupportedMediaTypeException('Invalid image file');
    }

    const existing = await this.prisma.user.findUnique({
      where: { id: command.userId },
      select: { avatarPath: true },
    });
    if (!existing) {
      await unlink(command.file.path).catch(() => undefined);
      throw new NotFoundException('User not found');
    }

    const user = await this.prisma.user.update({
      where: { id: command.userId },
      data: {
        avatarPath: command.file.path,
        avatarMimeType: command.file.mimetype,
      },
      select: { id: true, email: true, name: true, avatarPath: true },
    });

    if (existing.avatarPath) {
      await unlink(existing.avatarPath).catch(() => undefined);
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      hasAvatar: true,
    };
  }
}
