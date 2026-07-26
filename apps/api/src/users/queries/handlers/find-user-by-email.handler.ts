import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { User } from '../../../generated/prisma';
import { PrismaService } from '../../../prisma/prisma.service';
import { FindUserByEmailQuery } from '../impl/find-user-by-email.query';

@QueryHandler(FindUserByEmailQuery)
export class FindUserByEmailHandler implements IQueryHandler<
  FindUserByEmailQuery,
  User | null
> {
  constructor(private readonly prisma: PrismaService) {}

  execute(query: FindUserByEmailQuery): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email: query.email } });
  }
}
