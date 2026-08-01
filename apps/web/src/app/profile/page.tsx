'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Alert, Avatar, Button, Card, Spinner } from '@heroui/react';

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
      } catch {
        setError('Unable to reach the server. Please check your connection.');
      } finally {
        setIsLoading(false);
      }
    };

    void loadProfile();
  }, [router, reloadKey]);

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

              <div className="flex w-full flex-col gap-1">
                <span className="text-muted text-xs font-medium tracking-wide uppercase">
                  Name
                </span>
                <span className="text-foreground text-sm">
                  {profile.name ?? 'No name set'}
                </span>
              </div>
            </Card.Content>
          </Card>
        ) : null}
      </div>
    </main>
  );
}
