import { UnauthorizedException } from '@nestjs/common';
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs';
import * as bcrypt from 'bcrypt';
import { User } from '../../../generated/prisma';
import { FindUserByEmailQuery } from '../../../users/queries/impl/find-user-by-email.query';
import { AuthTokenResponse, TokenService } from '../../token.service';
import { LoginQuery } from '../impl/login.query';

@QueryHandler(LoginQuery)
export class LoginHandler implements IQueryHandler<
  LoginQuery,
  AuthTokenResponse
> {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly tokenService: TokenService,
  ) {}

  async execute(query: LoginQuery): Promise<AuthTokenResponse> {
    const user = await this.queryBus.execute<FindUserByEmailQuery, User | null>(
      new FindUserByEmailQuery(query.email),
    );
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(
      query.password,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.tokenService.issue(user.id, user.email);
  }
}
