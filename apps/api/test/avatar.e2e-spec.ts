import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'crypto';
import { existsSync, rmSync } from 'fs';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { PrismaService } from './../src/prisma/prisma.service';
import { AVATAR_MAX_FILE_SIZE_BYTES } from './../src/users/avatar-multer.config';

interface AuthResponseBody {
  accessToken: string;
}

interface UserProfileResponseBody {
  id: string;
  email: string;
  name: string | null;
  hasAvatar: boolean;
}

const JPEG_MAGIC_BYTES = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46,
]);
const PNG_MAGIC_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
]);

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

describe('Avatar (e2e)', () => {
  let app: INestApplication<App>;
  const createdAvatarPaths: string[] = [];

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

  afterAll(() => {
    for (const path of createdAvatarPaths) {
      rmSync(path, { force: true });
    }
  });

  async function getAvatarPath(accessToken: string): Promise<string> {
    const prisma = app.get(PrismaService);
    const response = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const { id } = response.body as UserProfileResponseBody;
    const user = await prisma.user.findUnique({ where: { id } });
    return user?.avatarPath ?? '';
  }

  describe('POST /users/me/avatar', () => {
    it('uploads a JPEG avatar and marks the profile as having one', async () => {
      const { accessToken } = await registerUser(app);

      const response = await request(app.getHttpServer())
        .post('/users/me/avatar')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', JPEG_MAGIC_BYTES, {
          filename: 'avatar.jpg',
          contentType: 'image/jpeg',
        })
        .expect(201);

      const body = response.body as UserProfileResponseBody;
      expect(body.hasAvatar).toBe(true);

      const avatarPath = await getAvatarPath(accessToken);
      createdAvatarPaths.push(avatarPath);
      expect(existsSync(avatarPath)).toBe(true);
    });

    it('uploads a PNG avatar and marks the profile as having one', async () => {
      const { accessToken } = await registerUser(app);

      const response = await request(app.getHttpServer())
        .post('/users/me/avatar')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', PNG_MAGIC_BYTES, {
          filename: 'avatar.png',
          contentType: 'image/png',
        })
        .expect(201);

      const body = response.body as UserProfileResponseBody;
      expect(body.hasAvatar).toBe(true);

      const avatarPath = await getAvatarPath(accessToken);
      createdAvatarPaths.push(avatarPath);
      expect(existsSync(avatarPath)).toBe(true);
    });

    it('replaces an existing avatar on disk when uploading again', async () => {
      const { accessToken } = await registerUser(app);

      await request(app.getHttpServer())
        .post('/users/me/avatar')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', JPEG_MAGIC_BYTES, {
          filename: 'avatar.jpg',
          contentType: 'image/jpeg',
        })
        .expect(201);
      const oldAvatarPath = await getAvatarPath(accessToken);

      await request(app.getHttpServer())
        .post('/users/me/avatar')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', PNG_MAGIC_BYTES, {
          filename: 'avatar.png',
          contentType: 'image/png',
        })
        .expect(201);
      const newAvatarPath = await getAvatarPath(accessToken);
      createdAvatarPaths.push(newAvatarPath);

      expect(newAvatarPath).not.toBe(oldAvatarPath);
      expect(existsSync(oldAvatarPath)).toBe(false);
      expect(existsSync(newAvatarPath)).toBe(true);
    });

    it('rejects a non-image file with 415 and does not change the profile', async () => {
      const { accessToken } = await registerUser(app);

      await request(app.getHttpServer())
        .post('/users/me/avatar')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', Buffer.from('not an image'), {
          filename: 'notes.txt',
          contentType: 'text/plain',
        })
        .expect(415);

      const response = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect((response.body as UserProfileResponseBody).hasAvatar).toBe(false);
    });

    it('rejects a file exceeding the maximum allowed size with 413 and does not change the profile', async () => {
      const { accessToken } = await registerUser(app);
      const oversized = Buffer.alloc(AVATAR_MAX_FILE_SIZE_BYTES + 1);
      JPEG_MAGIC_BYTES.copy(oversized);

      await request(app.getHttpServer())
        .post('/users/me/avatar')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', oversized, {
          filename: 'huge.jpg',
          contentType: 'image/jpeg',
        })
        .expect(413);

      const response = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect((response.body as UserProfileResponseBody).hasAvatar).toBe(false);
    }, 30000);

    it('rejects the request without an access token', async () => {
      await request(app.getHttpServer())
        .post('/users/me/avatar')
        .attach('file', JPEG_MAGIC_BYTES, {
          filename: 'avatar.jpg',
          contentType: 'image/jpeg',
        })
        .expect(401);
    });
  });

  describe('GET /users/me/avatar', () => {
    it("streams the owner's avatar with the correct headers", async () => {
      const { accessToken } = await registerUser(app);

      await request(app.getHttpServer())
        .post('/users/me/avatar')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', JPEG_MAGIC_BYTES, {
          filename: 'avatar.jpg',
          contentType: 'image/jpeg',
        })
        .expect(201);
      createdAvatarPaths.push(await getAvatarPath(accessToken));

      const response = await request(app.getHttpServer())
        .get('/users/me/avatar')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.headers['content-type']).toContain('image/jpeg');
      expect(response.headers['content-disposition']).toBe('inline');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(Buffer.from(response.body as Buffer)).toEqual(JPEG_MAGIC_BYTES);
    });

    it('returns 404 when the user has not uploaded an avatar', async () => {
      const { accessToken } = await registerUser(app);

      await request(app.getHttpServer())
        .get('/users/me/avatar')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('returns 404 when the avatar row exists but the file is missing on disk', async () => {
      const { accessToken } = await registerUser(app);

      await request(app.getHttpServer())
        .post('/users/me/avatar')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', JPEG_MAGIC_BYTES, {
          filename: 'avatar.jpg',
          contentType: 'image/jpeg',
        })
        .expect(201);
      const avatarPath = await getAvatarPath(accessToken);
      rmSync(avatarPath, { force: true });

      await request(app.getHttpServer())
        .get('/users/me/avatar')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('rejects the request without an access token', async () => {
      await request(app.getHttpServer()).get('/users/me/avatar').expect(401);
    });
  });
});
