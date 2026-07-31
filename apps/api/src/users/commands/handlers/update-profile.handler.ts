import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../prisma/prisma.service';
import { UserProfileResponse } from '../../user-profile.response';
import { UpdateProfileCommand } from '../impl/update-profile.command';

@CommandHandler(UpdateProfileCommand)
export class UpdateProfileHandler implements ICommandHandler<
  UpdateProfileCommand,
  UserProfileResponse
> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: UpdateProfileCommand): Promise<UserProfileResponse> {
    const trimmed = command.name.trim();
    const user = await this.prisma.user.update({
      where: { id: command.userId },
      data: { name: trimmed === '' ? null : trimmed },
      select: { id: true, email: true, name: true, avatarPath: true },
    });

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      hasAvatar: user.avatarPath !== null,
    };
  }
}
