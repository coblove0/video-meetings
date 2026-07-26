import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'crypto';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';

interface MeetingResponseBody {
  id: string;
  title: string;
  date: string;
  participants: string[];
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

describe('Meetings (e2e)', () => {
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

  describe('POST /meetings', () => {
    it('creates a new meeting with title, date and participants for the authenticated user', async () => {
      const { accessToken } = await registerUser(app);
      const payload = validMeetingPayload();

      const response = await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(payload)
        .expect(201);

      const body = response.body as MeetingResponseBody;
      expect(body.id).toEqual(expect.any(String));
      expect(body.title).toBe(payload.title);
      expect(body.date).toBe(payload.date);
      expect(body.participants).toEqual(payload.participants);
    });
  });

  describe('GET /meetings', () => {
    it("returns only the current user's meetings", async () => {
      const owner = await registerUser(app);
      const otherUser = await registerUser(app);

      const ownedMeeting = await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send(validMeetingPayload())
        .expect(201);

      await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', `Bearer ${otherUser.accessToken}`)
        .send(validMeetingPayload())
        .expect(201);

      const response = await request(app.getHttpServer())
        .get('/meetings')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);

      const body = response.body as MeetingResponseBody[];
      const ownedBody = ownedMeeting.body as MeetingResponseBody;
      expect(body).toHaveLength(1);
      expect(body[0].id).toBe(ownedBody.id);
    });
  });

  describe('GET /meetings/:id', () => {
    it('returns the meeting matching the given id', async () => {
      const { accessToken } = await registerUser(app);
      const payload = validMeetingPayload();

      const created = await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(payload)
        .expect(201);

      const { id } = created.body as MeetingResponseBody;

      const response = await request(app.getHttpServer())
        .get(`/meetings/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const body = response.body as MeetingResponseBody;
      expect(body.id).toBe(id);
      expect(body.title).toBe(payload.title);
      expect(body.date).toBe(payload.date);
      expect(body.participants).toEqual(payload.participants);
    });

    it('returns 404 when no meeting exists with the given id', async () => {
      const { accessToken } = await registerUser(app);

      await request(app.getHttpServer())
        .get(`/meetings/${randomUUID()}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });
});
