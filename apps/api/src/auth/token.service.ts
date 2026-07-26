import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export interface AuthTokenResponse {
  accessToken: string;
}

@Injectable()
export class TokenService {
  constructor(private readonly jwtService: JwtService) {}

  issue(userId: string, email: string): AuthTokenResponse {
    return { accessToken: this.jwtService.sign({ sub: userId, email }) };
  }
}
