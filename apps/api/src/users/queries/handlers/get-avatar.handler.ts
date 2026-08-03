import { NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service';
import { AvatarFile } from '../../avatar-file.response';
import { GetAvatarQuery } from '../impl/get-avatar.query';

@QueryHandler(GetAvatarQuery)
export class GetAvatarHandler implements IQueryHandler<
  GetAvatarQuery,
  AvatarFile
> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetAvatarQuery): Promise<AvatarFile> {
    const user = await this.prisma.user.findUnique({
      where: { id: query.userId },
      select: { avatarPath: true, avatarMimeType: true },
    });
    if (!user || !user.avatarPath || !user.avatarMimeType) {
      throw new NotFoundException('Avatar not found');
    }

    return { path: user.avatarPath, mimeType: user.avatarMimeType };
  }
}
