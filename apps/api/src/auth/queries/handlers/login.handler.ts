import { UnauthorizedException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthTokenResponse, TokenService } from '../../token.service';
import { LoginQuery } from '../impl/login.query';

@QueryHandler(LoginQuery)
export class LoginHandler implements IQueryHandler<
  LoginQuery,
  AuthTokenResponse
> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
  ) {}

  async execute(query: LoginQuery): Promise<AuthTokenResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: query.email },
    });
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
