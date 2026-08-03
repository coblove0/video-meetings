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

test.describe('Home page header', () => {
  test('links to /profile via an avatar and name/email', async ({
    page,
    request,
  }) => {
    const user = await registerUser(request);

    await loginViaUi(page, user.email, user.password);

    const profileLink = page.getByRole('link', { name: user.email });
    await expect(profileLink).toBeVisible();
    await expect(profileLink).toHaveAttribute('href', '/profile');

    await profileLink.click();
    await page.waitForURL('/profile');
  });
});
