import { randomUUID } from 'crypto';
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface Meeting {
  id: string;
}

async function registerUser(request: APIRequestContext) {
  const email = `e2e-${randomUUID()}@example.com`;
  const password = 'Sup3rSecret!';
  const response = await request.post(`${API_URL}/auth/register`, {
    data: { email, password },
  });
  const { accessToken } = (await response.json()) as { accessToken: string };
  return { email, password, accessToken };
}

async function createMeeting(request: APIRequestContext, accessToken: string) {
  const response = await request.post(`${API_URL}/meetings`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {
      title: 'E2E Sprint Review',
      date: '2026-08-01T10:00:00.000Z',
      participants: [`participant-${randomUUID()}@example.com`],
    },
  });
  return (await response.json()) as Meeting;
}

async function uploadFile(
  request: APIRequestContext,
  accessToken: string,
  meetingId: string,
  filename: string,
  content: string,
) {
  await request.post(`${API_URL}/meetings/${meetingId}/files`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    multipart: {
      file: {
        name: filename,
        mimeType: 'text/plain',
        buffer: Buffer.from(content, 'utf-8'),
      },
    },
  });
}

async function loginViaUi(page: Page, email: string, password: string) {
  await page.goto('/auth/login');
  await page.getByRole('textbox', { name: 'Email*' }).fill(email);
  await page
    .getByRole('textbox', { name: 'Password*', exact: true })
    .fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('/');
}

test.describe('Meeting page', () => {
  test('owner sees, downloads, and deletes a file', async ({
    page,
    request,
  }) => {
    const owner = await registerUser(request);
    const meeting = await createMeeting(request, owner.accessToken);
    await uploadFile(
      request,
      owner.accessToken,
      meeting.id,
      'notes.txt',
      'hello from e2e',
    );

    await loginViaUi(page, owner.email, owner.password);
    await page.goto(`/meetings/${meeting.id}`);

    await expect(page.getByText('notes.txt')).toBeVisible();
    await expect(page.getByText('text/plain')).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download notes.txt' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('notes.txt');

    await page.getByRole('button', { name: 'Delete notes.txt' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect(
      page.getByText('No files have been uploaded to this meeting yet.'),
    ).toBeVisible();
  });

  test('non-owner is denied access on direct navigation', async ({
    page,
    request,
  }) => {
    const owner = await registerUser(request);
    const meeting = await createMeeting(request, owner.accessToken);

    const outsider = await registerUser(request);
    await loginViaUi(page, outsider.email, outsider.password);

    await page.goto(`/meetings/${meeting.id}`);

    await expect(page.getByText('Access denied')).toBeVisible();
    await expect(
      page.getByText("You don't have permission to view this meeting."),
    ).toBeVisible();
  });
});

test.describe('Meeting page file upload', () => {
  test('uploaded file appears without reload, and a second upload keeps the first', async ({
    page,
    request,
  }) => {
    const owner = await registerUser(request);
    const meeting = await createMeeting(request, owner.accessToken);

    await loginViaUi(page, owner.email, owner.password);
    await page.goto(`/meetings/${meeting.id}`);

    await expect(
      page.getByText('No files have been uploaded to this meeting yet.'),
    ).toBeVisible();

    // A full page reload gets a fresh JS context, so this marker disappearing
    // would prove the upload navigated away instead of updating state in place.
    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>).__noReloadMarker = true;
    });

    const firstFileName = `first-${randomUUID()}.txt`;
    await page.getByLabel('Choose file to upload').setInputFiles({
      name: firstFileName,
      mimeType: 'text/plain',
      buffer: Buffer.from('first file contents', 'utf-8'),
    });
    await page.getByRole('button', { name: 'Upload', exact: true }).click();

    await expect(page.getByText(firstFileName)).toBeVisible();
    expect(
      await page.evaluate(
        () => (window as unknown as Record<string, unknown>).__noReloadMarker,
      ),
    ).toBe(true);

    const secondFileName = `second-${randomUUID()}.txt`;
    await page.getByLabel('Choose file to upload').setInputFiles({
      name: secondFileName,
      mimeType: 'text/plain',
      buffer: Buffer.from('second file contents', 'utf-8'),
    });
    await page.getByRole('button', { name: 'Upload', exact: true }).click();

    await expect(page.getByText(secondFileName)).toBeVisible();
    await expect(page.getByText(firstFileName)).toBeVisible();
  });

  test('disallowed file type shows an error and is not added to the list or backend', async ({
    page,
    request,
  }) => {
    const owner = await registerUser(request);
    const meeting = await createMeeting(request, owner.accessToken);

    await loginViaUi(page, owner.email, owner.password);
    await page.goto(`/meetings/${meeting.id}`);

    const invalidFileName = `invalid-${randomUUID()}.exe`;
    await page.getByLabel('Choose file to upload').setInputFiles({
      name: invalidFileName,
      mimeType: 'application/x-msdownload',
      buffer: Buffer.from('not a real executable', 'utf-8'),
    });
    await page.getByRole('button', { name: 'Upload', exact: true }).click();

    await expect(
      page.getByText('This file type is not supported.'),
    ).toBeVisible();
    await expect(page.getByText(invalidFileName)).not.toBeVisible();
    await expect(
      page.getByText('No files have been uploaded to this meeting yet.'),
    ).toBeVisible();

    const filesResponse = await request.get(
      `${API_URL}/meetings/${meeting.id}/files`,
      { headers: { Authorization: `Bearer ${owner.accessToken}` } },
    );
    const files = (await filesResponse.json()) as unknown[];
    expect(files).toHaveLength(0);
  });
});
