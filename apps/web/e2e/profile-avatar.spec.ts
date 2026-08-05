import { randomUUID } from 'crypto';
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function registerUser(request: APIRequestContext) {
  const email = `e2e-${randomUUID()}@example.com`;
  const password = 'Sup3rSecret!';
  const response = await request.post(`${API_URL}/auth/register`, {
    data: { email, password },
  });
  const { accessToken } = (await response.json()) as { accessToken: string };
  return { email, password, accessToken };
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

// Real, decodable JPEG/PNG bytes (via the browser's own canvas encoder)
// rather than a hand-built fixture, so a successful upload can be asserted
// by naturalWidth instead of just a 2xx response.
async function generateImage(
  page: Page,
  mimeType: 'image/jpeg' | 'image/png',
  fillStyle: string,
): Promise<Buffer> {
  const dataUrl = await page.evaluate(
    ({ mimeType, fillStyle }) => {
      const canvas = document.createElement('canvas');
      canvas.width = 4;
      canvas.height = 4;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('2D canvas context unavailable');
      ctx.fillStyle = fillStyle;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return canvas.toDataURL(mimeType, 0.92);
    },
    { mimeType, fillStyle },
  );
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

async function generateJpeg(page: Page): Promise<Buffer> {
  return generateImage(page, 'image/jpeg', '#3366ff');
}

async function uploadAvatar(page: Page, file: Buffer, name: string) {
  await page.getByLabel('Choose avatar to upload').setInputFiles({
    name,
    mimeType: name.endsWith('.png') ? 'image/png' : 'image/jpeg',
    buffer: file,
  });
  await page.getByRole('button', { name: 'Upload avatar' }).click();
}

test.describe('Profile page avatar upload', () => {
  test('uploads a valid JPEG and it renders as the avatar', async ({
    page,
    request,
  }) => {
    const user = await registerUser(request);
    await loginViaUi(page, user.email, user.password);
    await page.goto('/profile');
    await expect(page.getByText(user.email)).toBeVisible();

    const jpeg = await generateJpeg(page);
    await uploadAvatar(page, jpeg, 'avatar.jpg');

    const avatarImage = page.getByRole('img', { name: 'Your avatar' });
    await expect(avatarImage).toBeVisible();
    // Checking naturalWidth (not just that the <img> exists) proves the
    // blob URL actually decoded as an image, not just that some src was set.
    await expect
      .poll(() =>
        avatarImage.evaluate((el) => (el as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
  });

  test('replaces an existing avatar with a new upload, in the profile page and the home header, without breaking the display', async ({
    page,
    request,
  }) => {
    const user = await registerUser(request);
    await loginViaUi(page, user.email, user.password);
    await page.goto('/profile');
    await expect(page.getByText(user.email)).toBeVisible();

    const firstAvatar = await generateImage(page, 'image/jpeg', '#3366ff');
    await uploadAvatar(page, firstAvatar, 'first.jpg');

    const avatarImage = page.getByRole('img', { name: 'Your avatar' });
    await expect(avatarImage).toBeVisible();
    await expect
      .poll(() =>
        avatarImage.evaluate((el) => (el as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);

    const secondAvatar = await generateImage(page, 'image/png', '#ff6633');
    await uploadAvatar(page, secondAvatar, 'second.png');

    // The replacement must never leave the <img> pointed at an
    // already-revoked blob URL — it should stay visible and decodable
    // throughout, not just eventually end up that way.
    await expect(avatarImage).toBeVisible();
    await expect
      .poll(() =>
        avatarImage.evaluate((el) => (el as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);

    await page.goto('/');
    const headerAvatarImage = page.getByRole('img', { name: 'Your avatar' });
    await expect(headerAvatarImage).toBeVisible();
    await expect
      .poll(() =>
        headerAvatarImage.evaluate(
          (el) => (el as HTMLImageElement).naturalWidth,
        ),
      )
      .toBeGreaterThan(0);
  });

  test('shows an error for a non-image file and does not change the avatar', async ({
    page,
    request,
  }) => {
    const user = await registerUser(request);
    await loginViaUi(page, user.email, user.password);
    await page.goto('/profile');
    await expect(page.getByText(user.email)).toBeVisible();

    await page.getByLabel('Choose avatar to upload').setInputFiles({
      name: 'not-an-image.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('not an image', 'utf-8'),
    });
    await page.getByRole('button', { name: 'Upload avatar' }).click();

    await expect(
      page.getByText('This file type is not supported.'),
    ).toBeVisible();
    await expect(
      page.getByRole('img', { name: 'Your avatar' }),
    ).not.toBeVisible();
  });

  test('shows an error for a file exceeding the size limit and does not change the avatar', async ({
    page,
    request,
  }) => {
    const user = await registerUser(request);
    await loginViaUi(page, user.email, user.password);
    await page.goto('/profile');
    await expect(page.getByText(user.email)).toBeVisible();

    // Comfortably over the API's 5 MB avatar limit; content doesn't need to
    // be a real image since size is rejected before any content check.
    const oversized = Buffer.alloc(5 * 1024 * 1024 + 1024, 1);

    await page.getByLabel('Choose avatar to upload').setInputFiles({
      name: 'huge.jpg',
      mimeType: 'image/jpeg',
      buffer: oversized,
    });
    await page.getByRole('button', { name: 'Upload avatar' }).click();

    await expect(
      page.getByText('This file is too large to upload.'),
    ).toBeVisible();
    await expect(
      page.getByRole('img', { name: 'Your avatar' }),
    ).not.toBeVisible();
  });
});
