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

async function attemptLoginViaUi(page: Page, email: string, password: string) {
  await page.goto('/auth/login');
  await page.getByRole('textbox', { name: 'Email*' }).fill(email);
  await page
    .getByRole('textbox', { name: 'Password*', exact: true })
    .fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test.describe('Profile page change password', () => {
  test('changes the password via the UI so only the new password can log in afterward', async ({
    page,
    request,
  }) => {
    const user = await registerUser(request);
    const newPassword = 'N3wSecret!!';

    await loginViaUi(page, user.email, user.password);
    await page.goto('/profile');

    await page
      .getByRole('textbox', { name: 'Current password*', exact: true })
      .fill(user.password);
    await page
      .getByRole('textbox', { name: 'New password*', exact: true })
      .fill(newPassword);
    await page.getByRole('button', { name: 'Change password' }).click();

    await expect(page.getByText('Password changed.')).toBeVisible();
    await expect(
      page.getByRole('textbox', { name: 'Current password*', exact: true }),
    ).toHaveValue('');
    await expect(
      page.getByRole('textbox', { name: 'New password*', exact: true }),
    ).toHaveValue('');

    await page.evaluate(() => localStorage.removeItem('accessToken'));

    await attemptLoginViaUi(page, user.email, user.password);
    await expect(page.getByText('Invalid email or password.')).toBeVisible();

    await attemptLoginViaUi(page, user.email, newPassword);
    await page.waitForURL('/');
  });

  test('shows an inline error for the wrong current password, keeps the user on /profile, and does not silently clear the fields', async ({
    page,
    request,
  }) => {
    const user = await registerUser(request);
    const wrongCurrentPassword = 'TotallyWrong1!';
    const attemptedNewPassword = 'ShouldNotApply1!';

    await loginViaUi(page, user.email, user.password);
    await page.goto('/profile');

    const currentPasswordField = page.getByRole('textbox', {
      name: 'Current password*',
      exact: true,
    });
    const newPasswordField = page.getByRole('textbox', {
      name: 'New password*',
      exact: true,
    });

    await currentPasswordField.fill(wrongCurrentPassword);
    await newPasswordField.fill(attemptedNewPassword);
    await page.getByRole('button', { name: 'Change password' }).click();

    await expect(page.getByText('Current password is incorrect')).toBeVisible();
    await expect(page).toHaveURL('/profile');
    await expect(currentPasswordField).toHaveValue(wrongCurrentPassword);
    await expect(newPasswordField).toHaveValue(attemptedNewPassword);

    const token = await page.evaluate(() =>
      localStorage.getItem('accessToken'),
    );
    expect(token).not.toBeNull();

    await page.evaluate(() => localStorage.removeItem('accessToken'));
    await attemptLoginViaUi(page, user.email, user.password);
    await page.waitForURL('/');
  });
});
