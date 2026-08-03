'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import {
  Alert,
  Avatar,
  Button,
  Card,
  FieldError,
  Form,
  Input,
  Label,
  Spinner,
  TextField,
} from '@heroui/react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  hasAvatar: boolean;
}

function getInitials(name: string | null, email: string): string {
  const trimmedName = name?.trim();
  if (trimmedName) {
    const initials = trimmedName
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('');
    if (initials) return initials;
  }
  return email[0]?.toUpperCase() ?? '?';
}

export default function ProfilePage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      router.replace('/auth/login');
      return;
    }

    const loadProfile = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`${API_URL}/users/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.status === 401) {
          localStorage.removeItem('accessToken');
          router.replace('/auth/login');
          return;
        }

        if (!response.ok) {
          setError('Could not load your profile.');
          return;
        }

        const data: UserProfile = await response.json();
        setProfile(data);
        setName(data.name ?? '');
      } catch {
        setError('Unable to reach the server. Please check your connection.');
      } finally {
        setIsLoading(false);
      }
    };

    void loadProfile();
  }, [router, reloadKey]);

  const onSaveName = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const token = localStorage.getItem('accessToken');
    if (!token) {
      router.replace('/auth/login');
      return;
    }

    setSaveError(null);
    setIsSaving(true);

    try {
      const response = await fetch(`${API_URL}/users/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name }),
      });

      if (response.status === 401) {
        localStorage.removeItem('accessToken');
        router.replace('/auth/login');
        return;
      }

      if (!response.ok) {
        setSaveError('Could not save your name.');
        return;
      }

      const data: UserProfile = await response.json();
      setProfile(data);
      setName(data.name ?? '');
    } catch {
      setSaveError('Unable to reach the server. Please check your connection.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <main className="flex min-h-dvh w-full items-center justify-center">
        <Spinner size="lg" />
      </main>
    );
  }

  return (
    <main
      className="flex min-h-dvh w-full justify-center px-4 py-6 sm:py-10"
      style={{
        background:
          'radial-gradient(ellipse 80% 60% at 50% -10%, var(--accent-soft), transparent), var(--background)',
      }}
    >
      <div className="flex w-full max-w-md flex-col gap-4 sm:gap-6">
        <h1 className="text-foreground text-xl font-semibold tracking-tight sm:text-2xl">
          Profile
        </h1>

        {error ? (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{error}</Alert.Description>
            </Alert.Content>
            <Button
              size="sm"
              variant="outline"
              onPress={() => setReloadKey((key) => key + 1)}
            >
              Retry
            </Button>
          </Alert>
        ) : null}

        {profile ? (
          <Card className="w-full shadow-xl">
            <Card.Content className="flex flex-col items-center gap-4 py-6">
              <Avatar size="lg">
                <Avatar.Fallback>
                  {getInitials(profile.name, profile.email)}
                </Avatar.Fallback>
              </Avatar>

              <div className="flex w-full flex-col gap-1">
                <span className="text-muted text-xs font-medium tracking-wide uppercase">
                  Email
                </span>
                <span className="text-foreground text-sm">{profile.email}</span>
              </div>

              <Form className="w-full" onSubmit={onSaveName}>
                <div className="flex w-full flex-col gap-3">
                  {saveError ? (
                    <Alert status="danger">
                      <Alert.Indicator />
                      <Alert.Content>
                        <Alert.Description>{saveError}</Alert.Description>
                      </Alert.Content>
                    </Alert>
                  ) : null}

                  <TextField
                    maxLength={100}
                    name="name"
                    value={name}
                    onChange={setName}
                  >
                    <Label className="text-muted text-xs font-medium tracking-wide uppercase">
                      Name
                    </Label>
                    <Input
                      className="min-h-11"
                      placeholder="Add your name"
                      variant="secondary"
                    />
                    <FieldError />
                  </TextField>

                  <Button className="w-fit" isPending={isSaving} type="submit">
                    {({ isPending }) => (
                      <>
                        {isPending ? (
                          <Spinner color="current" size="sm" />
                        ) : null}
                        {isPending ? 'Saving…' : 'Save'}
                      </>
                    )}
                  </Button>
                </div>
              </Form>
            </Card.Content>
          </Card>
        ) : null}
      </div>
    </main>
  );
}
