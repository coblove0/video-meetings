import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'crypto';
import { existsSync, rmSync } from 'fs';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { PrismaService } from './../src/prisma/prisma.service';
import { MAX_FILE_SIZE_BYTES } from './../src/meeting-files/multer.config';

interface MeetingFileResponseBody {
  id: string;
  originalName: string;
  size: number;
  mimeType: string;
  storagePath: string;
  meetingId: string;
}

interface MeetingResponseBody {
  id: string;
}

interface AuthResponseBody {
  accessToken: string;
}

function uniqueCredentials() {
  return {
    email: `test-${randomUUID()}@example.com`,
    password: 'Sup3rSecret!',
  };
}

function validMeetingPayload() {
  return {
    title: 'Sprint planning',
    date: '2026-08-01T10:00:00.000Z',
    participants: [`participant-${randomUUID()}@example.com`],
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

async function createMeeting(app: INestApplication<App>, accessToken: string) {
  const response = await request(app.getHttpServer())
    .post('/meetings')
    .set('Authorization', `Bearer ${accessToken}`)
    .send(validMeetingPayload())
    .expect(201);

  return (response.body as MeetingResponseBody).id;
}

describe('MeetingFiles (e2e)', () => {
  let app: INestApplication<App>;
  const createdStoragePaths: string[] = [];

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
    for (const path of createdStoragePaths) {
      rmSync(path, { force: true });
    }
  });

  describe('POST /meetings/:id/files', () => {
    it("uploads a file to the owner's meeting and persists it on disk and in the database", async () => {
      const { accessToken } = await registerUser(app);
      const meetingId = await createMeeting(app, accessToken);

      const response = await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', Buffer.from('%PDF-1.4 test content'), {
          filename: 'notes.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);

      const body = response.body as MeetingFileResponseBody;
      createdStoragePaths.push(body.storagePath);

      expect(body.id).toEqual(expect.any(String));
      expect(body.originalName).toBe('notes.pdf');
      expect(body.mimeType).toBe('application/pdf');
      expect(body.meetingId).toBe(meetingId);
      expect(existsSync(body.storagePath)).toBe(true);

      const prisma = app.get(PrismaService);
      const stored = await prisma.meetingFile.findUnique({
        where: { id: body.id },
      });
      expect(stored?.storagePath).toBe(body.storagePath);
    });

    it('returns 404 and does not persist the file when the meeting belongs to another user', async () => {
      const owner = await registerUser(app);
      const other = await registerUser(app);
      const meetingId = await createMeeting(app, owner.accessToken);

      await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${other.accessToken}`)
        .attach('file', Buffer.from('%PDF-1.4 test content'), {
          filename: 'notes.pdf',
          contentType: 'application/pdf',
        })
        .expect(404);

      const prisma = app.get(PrismaService);
      const count = await prisma.meetingFile.count({ where: { meetingId } });
      expect(count).toBe(0);
    });

    it('rejects a file with a disallowed MIME type and does not save it anywhere', async () => {
      const { accessToken } = await registerUser(app);
      const meetingId = await createMeeting(app, accessToken);

      await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', Buffer.from('#!/bin/sh\necho hi'), {
          filename: 'script.sh',
          contentType: 'application/x-sh',
        })
        .expect(415);

      const prisma = app.get(PrismaService);
      const count = await prisma.meetingFile.count({ where: { meetingId } });
      expect(count).toBe(0);
    });

    it('rejects a file exceeding the maximum allowed size and does not save it anywhere', async () => {
      const { accessToken } = await registerUser(app);
      const meetingId = await createMeeting(app, accessToken);
      const oversized = Buffer.alloc(MAX_FILE_SIZE_BYTES + 1);

      await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', oversized, {
          filename: 'huge.pdf',
          contentType: 'application/pdf',
        })
        .expect(413);

      const prisma = app.get(PrismaService);
      const count = await prisma.meetingFile.count({ where: { meetingId } });
      expect(count).toBe(0);
    }, 30000);
  });

  describe('GET /meetings/:id/files', () => {
    it("lists the owner's files with name, size, MIME type and upload date", async () => {
      const { accessToken } = await registerUser(app);
      const meetingId = await createMeeting(app, accessToken);

      const upload = await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', Buffer.from('%PDF-1.4 test content'), {
          filename: 'notes.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);
      createdStoragePaths.push(
        (upload.body as MeetingFileResponseBody).storagePath,
      );

      const response = await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const body = response.body as MeetingFileResponseBody[];
      expect(body).toHaveLength(1);
      expect(body[0]).toMatchObject({
        originalName: 'notes.pdf',
        mimeType: 'application/pdf',
        size: expect.any(Number) as number,
      });
      expect(body[0]).toHaveProperty('createdAt');
    });

    it('returns 404 for a meeting belonging to another user', async () => {
      const owner = await registerUser(app);
      const other = await registerUser(app);
      const meetingId = await createMeeting(app, owner.accessToken);

      await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${other.accessToken}`)
        .expect(404);
    });
  });

  describe('GET /meetings/:id/files/:fileId/download', () => {
    it("streams the owner's file with the correct headers", async () => {
      const { accessToken } = await registerUser(app);
      const meetingId = await createMeeting(app, accessToken);

      const upload = await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', Buffer.from('%PDF-1.4 test content'), {
          filename: 'notes.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);
      const fileId = (upload.body as MeetingFileResponseBody).id;
      createdStoragePaths.push(
        (upload.body as MeetingFileResponseBody).storagePath,
      );

      const response = await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/files/${fileId}/download`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.headers['content-type']).toContain('application/pdf');
      expect(response.headers['content-disposition']).toContain('notes.pdf');
      expect(Buffer.from(response.body as Buffer).toString()).toBe(
        '%PDF-1.4 test content',
      );
    });

    it('returns 404 when the file belongs to another user', async () => {
      const owner = await registerUser(app);
      const other = await registerUser(app);
      const meetingId = await createMeeting(app, owner.accessToken);

      const upload = await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .attach('file', Buffer.from('%PDF-1.4 test content'), {
          filename: 'notes.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);
      const fileId = (upload.body as MeetingFileResponseBody).id;
      createdStoragePaths.push(
        (upload.body as MeetingFileResponseBody).storagePath,
      );

      await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/files/${fileId}/download`)
        .set('Authorization', `Bearer ${other.accessToken}`)
        .expect(404);
    });
  });

  describe('DELETE /meetings/:id/files/:fileId', () => {
    it("deletes the owner's file record and its content on disk", async () => {
      const { accessToken } = await registerUser(app);
      const meetingId = await createMeeting(app, accessToken);

      const upload = await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', Buffer.from('%PDF-1.4 test content'), {
          filename: 'notes.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);
      const { id: fileId, storagePath } =
        upload.body as MeetingFileResponseBody;

      await request(app.getHttpServer())
        .delete(`/meetings/${meetingId}/files/${fileId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      const prisma = app.get(PrismaService);
      const stored = await prisma.meetingFile.findUnique({
        where: { id: fileId },
      });
      expect(stored).toBeNull();
      expect(existsSync(storagePath)).toBe(false);
    });

    it('returns 404 and leaves the file untouched when it belongs to another user', async () => {
      const owner = await registerUser(app);
      const other = await registerUser(app);
      const meetingId = await createMeeting(app, owner.accessToken);

      const upload = await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .attach('file', Buffer.from('%PDF-1.4 test content'), {
          filename: 'notes.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);
      const { id: fileId, storagePath } =
        upload.body as MeetingFileResponseBody;
      createdStoragePaths.push(storagePath);

      await request(app.getHttpServer())
        .delete(`/meetings/${meetingId}/files/${fileId}`)
        .set('Authorization', `Bearer ${other.accessToken}`)
        .expect(404);

      const prisma = app.get(PrismaService);
      const stored = await prisma.meetingFile.findUnique({
        where: { id: fileId },
      });
      expect(stored).not.toBeNull();
      expect(existsSync(storagePath)).toBe(true);
    });
  });
});
