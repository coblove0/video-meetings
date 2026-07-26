'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  Alert,
  Button,
  Card,
  Description,
  FieldError,
  Form,
  Input,
  Label,
  Spinner,
  TextField,
} from '@heroui/react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const EMAIL_PATTERN = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        if (response.status === 409) {
          setFieldErrors({
            email: 'An account with this email already exists.',
          });
        } else {
          const body: { message?: string | string[] } | null = await response
            .json()
            .catch(() => null);
          const message = Array.isArray(body?.message)
            ? body.message[0]
            : body?.message;
          setFormError(message ?? 'Something went wrong. Please try again.');
        }
        return;
      }

      const data: { accessToken: string } = await response.json();
      localStorage.setItem('accessToken', data.accessToken);
      router.push('/');
    } catch {
      setFormError(
        'Unable to reach the server. Please check your connection and try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main
      className="flex min-h-dvh w-full items-center justify-center overflow-y-auto px-4 py-6 sm:py-10"
      style={{
        background:
          'radial-gradient(ellipse 80% 60% at 50% -10%, var(--accent-soft), transparent), var(--background)',
      }}
    >
      <div className="flex w-full max-w-md flex-col items-center gap-3 sm:gap-6">
        <div className="hidden flex-col items-center gap-2 text-center [@media(min-height:700px)]:flex">
          <div className="bg-accent text-accent-foreground flex size-10 items-center justify-center rounded-2xl shadow-lg sm:size-12">
            <svg
              aria-hidden="true"
              className="size-5 sm:size-6"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M3 7a3 3 0 0 1 3-3h7a3 3 0 0 1 3 3v1.382l3.106-1.553A1 1 0 0 1 21 7.723v8.554a1 1 0 0 1-1.447.894L16 15.618V17a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7Z" />
            </svg>
          </div>
          <h1 className="text-foreground text-xl font-semibold tracking-tight sm:text-2xl">
            Video Meetings
          </h1>
        </div>

        <Card className="w-full shadow-xl">
          <Card.Header>
            <Card.Title>Create your account</Card.Title>
            <Card.Description>
              Sign up with your email to start scheduling meetings.
            </Card.Description>
          </Card.Header>

          <Form validationErrors={fieldErrors} onSubmit={onSubmit}>
            <Card.Content className="flex flex-col gap-3 sm:gap-4">
              {formError ? (
                <Alert status="danger">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>Registration failed</Alert.Title>
                    <Alert.Description>{formError}</Alert.Description>
                  </Alert.Content>
                </Alert>
              ) : null}

              <TextField
                isRequired
                name="email"
                type="email"
                value={email}
                onChange={setEmail}
                validate={(value) =>
                  EMAIL_PATTERN.test(value)
                    ? null
                    : 'Please enter a valid email address'
                }
              >
                <Label>Email</Label>
                <Input placeholder="you@example.com" variant="secondary" />
                <FieldError />
              </TextField>

              <TextField
                isRequired
                minLength={8}
                name="password"
                type="password"
                value={password}
                onChange={setPassword}
                validate={(value) =>
                  value.length < 8
                    ? 'Password must be at least 8 characters'
                    : null
                }
              >
                <Label>Password</Label>
                <Input placeholder="••••••••" variant="secondary" />
                <Description>Must be at least 8 characters.</Description>
                <FieldError />
              </TextField>

              <TextField
                isRequired
                name="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                validate={(value) =>
                  value !== password ? 'Passwords do not match' : null
                }
              >
                <Label>Confirm password</Label>
                <Input placeholder="••••••••" variant="secondary" />
                <FieldError />
              </TextField>
            </Card.Content>

            <Card.Footer className="mt-1 flex flex-col gap-3 sm:mt-2">
              <Button className="w-full" isPending={isSubmitting} type="submit">
                {({ isPending }) => (
                  <>
                    {isPending ? <Spinner color="current" size="sm" /> : null}
                    {isPending ? 'Creating account…' : 'Create account'}
                  </>
                )}
              </Button>
            </Card.Footer>
          </Form>
        </Card>
      </div>
    </main>
  );
}
