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

function detectImageMimeType(content: Buffer): string | null {
  if (content.subarray(0, JPEG_SIGNATURE.length).equals(JPEG_SIGNATURE)) {
    return 'image/jpeg';
  }
  if (content.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return 'image/png';
  }
  return null;
}

interface UpdatedAvatarOwner {
  id: string;
  email: string;
  name: string | null;
}

@CommandHandler(UploadAvatarCommand)
export class UploadAvatarHandler implements ICommandHandler<
  UploadAvatarCommand,
  UserProfileResponse
> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: UploadAvatarCommand): Promise<UserProfileResponse> {
    const content = await readFile(command.file.path);
    const detectedMimeType = detectImageMimeType(content);
    if (!detectedMimeType || detectedMimeType !== command.file.mimetype) {
      await unlink(command.file.path).catch(() => undefined);
      throw new UnsupportedMediaTypeException('Invalid image file');
    }

    let user: UpdatedAvatarOwner;
    let previousAvatarPath: string | null;
    try {
      // Row lock via SELECT ... FOR UPDATE so two concurrent uploads for the
      // same user can't both read the same "old" avatarPath and leak a file.
      ({ user, previousAvatarPath } = await this.prisma.$transaction(
        async (tx) => {
          const [existing] = await tx.$queryRaw<
            { avatarPath: string | null }[]
          >`SELECT "avatarPath" FROM "User" WHERE id = ${command.userId} FOR UPDATE`;
          if (!existing) {
            throw new NotFoundException('User not found');
          }

          const updated = await tx.user.update({
            where: { id: command.userId },
            data: {
              avatarPath: command.file.path,
              avatarMimeType: command.file.mimetype,
            },
            select: { id: true, email: true, name: true },
          });

          return { user: updated, previousAvatarPath: existing.avatarPath };
        },
      ));
    } catch (error) {
      await unlink(command.file.path).catch(() => undefined);
      throw error;
    }

    if (previousAvatarPath) {
      await unlink(previousAvatarPath).catch(() => undefined);
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      hasAvatar: true,
    };
  }
}
