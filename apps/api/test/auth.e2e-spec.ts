import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'crypto';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';

interface AuthResponseBody {
  accessToken: string;
}

const JWT_PATTERN = /^[\w-]+\.[\w-]+\.[\w-]+$/;

function uniqueCredentials() {
  return {
    email: `test-${randomUUID()}@example.com`,
    password: 'Sup3rSecret!',
  };
}

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = configureApp(moduleFixture.createNestApplication());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /auth/register', () => {
    it('creates a new user and returns a JWT', async () => {
      const { email, password } = uniqueCredentials();

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password })
        .expect(201);

      const body = response.body as AuthResponseBody;
      expect(Object.keys(body)).toEqual(['accessToken']);
      expect(body.accessToken).toMatch(JWT_PATTERN);
    });

    it('rejects registration when the email is already taken', async () => {
      const { email, password } = uniqueCredentials();

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password })
        .expect(201);

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password })
        .expect(409);
    });

    it('rejects registration without an email', async () => {
      const { password } = uniqueCredentials();

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ password })
        .expect(400);
    });

    it('rejects registration without a password', async () => {
      const { email } = uniqueCredentials();

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email })
        .expect(400);
    });

    it('rejects registration with a malformed email', async () => {
      const { password } = uniqueCredentials();

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'not-an-email', password })
        .expect(400);
    });

    it('rejects a password longer than 72 characters', async () => {
      const { email } = uniqueCredentials();

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password: 'a'.repeat(73) })
        .expect(400);
    });
  });

  describe('POST /auth/login', () => {
    it('returns a JWT for valid credentials', async () => {
      const { email, password } = uniqueCredentials();

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password })
        .expect(201);

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(200);

      const body = response.body as AuthResponseBody;
      expect(Object.keys(body)).toEqual(['accessToken']);
      expect(body.accessToken).toMatch(JWT_PATTERN);
    });

    it('does not create a user on login: registering the same email afterwards still succeeds', async () => {
      const { email, password } = uniqueCredentials();

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(401);

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password })
        .expect(201);
    });

    it('does not register a duplicate user on repeated logins', async () => {
      const { email, password } = uniqueCredentials();

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password })
        .expect(201);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(200);

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password })
        .expect(409);
    });

    it('rejects login with an incorrect password', async () => {
      const { email, password } = uniqueCredentials();

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password })
        .expect(201);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'wrong-password' })
        .expect(401);
    });

    it('rejects login for an email that was never registered', async () => {
      const { email, password } = uniqueCredentials();

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(401);
    });

    it('rejects login without an email', async () => {
      const { password } = uniqueCredentials();

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ password })
        .expect(400);
    });

    it('rejects login without a password', async () => {
      const { email } = uniqueCredentials();

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email })
        .expect(400);
    });
  });
});
