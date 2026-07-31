import { NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service';
import { UserProfileResponse } from '../../user-profile.response';
import { GetCurrentUserQuery } from '../impl/get-current-user.query';

@QueryHandler(GetCurrentUserQuery)
export class GetCurrentUserHandler implements IQueryHandler<
  GetCurrentUserQuery,
  UserProfileResponse
> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetCurrentUserQuery): Promise<UserProfileResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: query.userId },
      select: { id: true, email: true, name: true, avatarPath: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      hasAvatar: user.avatarPath !== null,
    };
  }
}
