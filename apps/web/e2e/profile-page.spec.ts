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
    await page.waitForURL('/auth/login', { timeout: 5000 });
  });

  test('clears an invalid token and redirects to /auth/login on load', async ({
    page,
  }) => {
    await page.addInitScript(
      (token) => localStorage.setItem('accessToken', token),
      'this-is-not-a-valid-jwt',
    );

    await page.goto('/profile');
    await page.waitForURL('/auth/login', { timeout: 5000 });

    const token = await page.evaluate(() =>
      localStorage.getItem('accessToken'),
    );
    expect(token).toBeNull();
  });

  test('shows a retryable alert when the profile fails to load', async ({
    page,
    request,
  }) => {
    const user = await registerUser(request);
    await page.addInitScript(
      (token) => localStorage.setItem('accessToken', token),
      user.accessToken,
    );

    let shouldFail = true;
    await page.route(`${API_URL}/users/me`, async (route) => {
      if (route.request().method() === 'GET' && shouldFail) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'boom' }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto('/profile');
    await expect(page.getByText('Could not load your profile.')).toBeVisible();

    shouldFail = false;
    await page.getByRole('button', { name: 'Retry' }).click();

    await expect(page.getByText(user.email)).toBeVisible();
  });

  test('shows an inline alert when saving the name fails, without clearing the field', async ({
    page,
    request,
  }) => {
    const user = await registerUser(request);
    await loginViaUi(page, user.email, user.password);
    await page.goto('/profile');

    await page.route(`${API_URL}/users/me`, async (route) => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'boom' }),
        });
        return;
      }
      await route.continue();
    });

    const nameField = page.getByRole('textbox', { name: 'Name' });
    const attemptedName = `Should not save ${randomUUID()}`;
    await nameField.fill(attemptedName);
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Could not save your name.')).toBeVisible();
    await expect(nameField).toHaveValue(attemptedName);
  });

  test('clears the token and redirects to /auth/login when saving returns 401', async ({
    page,
    request,
  }) => {
    const user = await registerUser(request);
    await loginViaUi(page, user.email, user.password);
    await page.goto('/profile');

    await page.route(`${API_URL}/users/me`, async (route) => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Unauthorized' }),
        });
        return;
      }
      await route.continue();
    });

    await page.getByRole('textbox', { name: 'Name' }).fill('New Name');
    await page.getByRole('button', { name: 'Save' }).click();

    await page.waitForURL('/auth/login', { timeout: 5000 });

    const token = await page.evaluate(() =>
      localStorage.getItem('accessToken'),
    );
    expect(token).toBeNull();
  });
});
