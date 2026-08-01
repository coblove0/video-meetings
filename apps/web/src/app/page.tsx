'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Alert, Avatar, Button, Card, Link, Spinner } from '@heroui/react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface Meeting {
  id: string;
  title: string;
  date: string;
  participants: string[];
}

interface CurrentUser {
  email: string;
  name: string | null;
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

export default function HomePage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      router.replace('/auth/login');
      return;
    }

    const loadData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const [userResponse, meetingsResponse] = await Promise.all([
          fetch(`${API_URL}/users/me`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_URL}/meetings`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (userResponse.status === 401 || meetingsResponse.status === 401) {
          localStorage.removeItem('accessToken');
          router.replace('/auth/login');
          return;
        }

        if (!userResponse.ok || !meetingsResponse.ok) {
          setError('Could not load your data.');
          return;
        }

        const user: CurrentUser = await userResponse.json();
        const data: Meeting[] = await meetingsResponse.json();
        setCurrentUser(user);
        setMeetings(data);
      } catch {
        setError('Unable to reach the server. Please check your connection.');
      } finally {
        setIsLoading(false);
      }
    };

    void loadData();
  }, [router, reloadKey]);

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    router.replace('/auth/login');
  };

  if (isLoading) {
    return (
      <main className="flex min-h-dvh w-full items-center justify-center">
        <Spinner size="lg" />
      </main>
    );
  }

  const recentMeetings = [...meetings]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 3);

  return (
    <main
      className="flex min-h-dvh w-full justify-center px-4 py-6 sm:py-10"
      style={{
        background:
          'radial-gradient(ellipse 80% 60% at 50% -10%, var(--accent-soft), transparent), var(--background)',
      }}
    >
      <div className="flex w-full max-w-2xl flex-col gap-4 sm:gap-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-foreground text-xl font-semibold tracking-tight sm:text-2xl">
              Welcome back
            </h1>
          </div>
          <div className="flex min-w-0 items-center gap-3">
            {currentUser ? (
              <Link
                className="flex min-h-11 min-w-0 items-center gap-2 no-underline"
                href="/profile"
              >
                <Avatar size="sm">
                  <Avatar.Fallback>
                    {getInitials(currentUser.name, currentUser.email)}
                  </Avatar.Fallback>
                </Avatar>
                <span className="text-foreground max-w-32 truncate text-sm sm:max-w-48">
                  {currentUser.name || currentUser.email}
                </span>
              </Link>
            ) : null}
            <Button
              className="shrink-0"
              variant="outline"
              onPress={handleLogout}
            >
              Log out
            </Button>
          </div>
        </div>

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

        <Card className="w-full shadow-xl">
          <Card.Header className="flex flex-row items-center justify-between">
            <div>
              <Card.Title>Your meetings</Card.Title>
              <Card.Description>
                {meetings.length}{' '}
                {meetings.length === 1 ? 'meeting' : 'meetings'} total
              </Card.Description>
            </div>
            <Button isDisabled variant="secondary">
              Create meeting
            </Button>
          </Card.Header>

          <Card.Content className="flex flex-col gap-3">
            {recentMeetings.length === 0 ? (
              <p className="text-muted text-sm">
                You don&apos;t have any meetings yet.
              </p>
            ) : (
              recentMeetings.map((meeting) => (
                <Link
                  key={meeting.id}
                  className="border-border hover:bg-muted-soft flex flex-col gap-1 rounded-xl border p-3 no-underline"
                  href={`/meetings/${meeting.id}`}
                >
                  <span className="text-foreground text-sm font-medium">
                    {meeting.title}
                  </span>
                  <span className="text-muted text-xs">
                    {new Intl.DateTimeFormat(undefined, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(meeting.date))}
                  </span>
                </Link>
              ))
            )}
          </Card.Content>
        </Card>
      </div>
    </main>
  );
}
