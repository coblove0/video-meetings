'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Alert, Button, Card, Link, Spinner } from '@heroui/react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface Meeting {
  id: string;
  title: string;
  date: string;
  participants: string[];
}

function decodeEmailFromToken(token: string): string | null {
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const { email } = JSON.parse(json) as { email?: string };
    return email ?? null;
  } catch {
    return null;
  }
}

export default function HomePage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      router.replace('/auth/login');
      return;
    }

    const loadMeetings = async () => {
      setEmail(decodeEmailFromToken(token));
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`${API_URL}/meetings`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.status === 401) {
          localStorage.removeItem('accessToken');
          router.replace('/auth/login');
          return;
        }

        if (!response.ok) {
          setError('Could not load your meetings.');
          return;
        }

        const data: Meeting[] = await response.json();
        setMeetings(data);
      } catch {
        setError('Unable to reach the server. Please check your connection.');
      } finally {
        setIsLoading(false);
      }
    };

    void loadMeetings();
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
            {email ? <p className="text-muted text-sm">{email}</p> : null}
          </div>
          <Button variant="outline" onPress={handleLogout}>
            Log out
          </Button>
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
