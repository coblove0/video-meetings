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

interface UserProfileResponseBody {
  id: string;
  email: string;
  name: string | null;
  hasAvatar: boolean;
}

function uniqueCredentials() {
  return {
    email: `test-${randomUUID()}@example.com`,
    password: 'Sup3rSecret!',
  };
}

async function registerUser(app: INestApplication<App>) {
  const { email, password } = uniqueCredentials();
  const response = await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password })
    .expect(201);

  const { accessToken } = response.body as AuthResponseBody;
  return { accessToken, email };
}

describe('Users (e2e)', () => {
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

  describe('GET /users/me', () => {
    it("returns the authenticated user's profile", async () => {
      const { accessToken, email } = await registerUser(app);

      const response = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const body = response.body as UserProfileResponseBody;
      expect(body).toMatchObject({
        id: expect.any(String) as string,
        email,
        name: null,
        hasAvatar: false,
      });
      expect(body).not.toHaveProperty('passwordHash');
    });

    it('rejects the request without an access token', async () => {
      await request(app.getHttpServer()).get('/users/me').expect(401);
    });
  });

  describe('PATCH /users/me', () => {
    it("updates the authenticated user's name and returns the updated profile", async () => {
      const { accessToken, email } = await registerUser(app);

      const response = await request(app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Ada Lovelace' })
        .expect(200);

      const body = response.body as UserProfileResponseBody;
      expect(body).toMatchObject({
        id: expect.any(String) as string,
        email,
        name: 'Ada Lovelace',
        hasAvatar: false,
      });
    });

    it('persists the name change across a subsequent GET', async () => {
      const { accessToken } = await registerUser(app);

      await request(app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Grace Hopper' })
        .expect(200);

      const response = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect((response.body as UserProfileResponseBody).name).toBe(
        'Grace Hopper',
      );
    });

    it('rejects the request without an access token', async () => {
      await request(app.getHttpServer())
        .patch('/users/me')
        .send({ name: 'No Token' })
        .expect(401);
    });

    it('rejects a body containing an unknown field', async () => {
      const { accessToken } = await registerUser(app);

      await request(app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Ada Lovelace', isAdmin: true })
        .expect(400);
    });

    it('rejects a name longer than 100 characters', async () => {
      const { accessToken } = await registerUser(app);

      await request(app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'a'.repeat(101) })
        .expect(400);
    });
  });
});
