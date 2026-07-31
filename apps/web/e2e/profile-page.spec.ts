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

test.describe('Profile page', () => {
  test('shows email and name, and an edited name survives a reload', async ({
    page,
    request,
  }) => {
    const user = await registerUser(request);

    await loginViaUi(page, user.email, user.password);
    await page.goto('/profile');

    await expect(page.getByText(user.email)).toBeVisible();

    const nameField = page.getByRole('textbox', { name: 'Name' });
    await expect(nameField).toBeVisible();
    await expect(nameField).toHaveValue('');

    const newName = `E2E User ${randomUUID()}`;
    await nameField.fill(newName);
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(nameField).toHaveValue(newName);

    await page.reload();

    await expect(page.getByText(user.email)).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue(
      newName,
    );
  });

  test('redirects an unauthenticated visitor to /auth/login', async ({
    page,
  }) => {
    await page.goto('/profile');
    await page.waitForURL('/auth/login');
  });
});
