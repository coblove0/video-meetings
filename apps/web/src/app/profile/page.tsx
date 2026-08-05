'use client';

import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
  type SVGProps,
} from 'react';
import {
  Alert,
  Avatar,
  Button,
  Card,
  FieldError,
  Form,
  Input,
  Label,
  ProgressBar,
  Spinner,
  TextField,
} from '@heroui/react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const AVATAR_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_AVATAR_MIME_TYPES = ['image/jpeg', 'image/png'];

class AvatarUploadHttpError extends Error {
  constructor(readonly status: number) {
    super(`Avatar upload failed with status ${status}`);
  }
}

function UploadIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
      {...props}
    >
      <path d="M12 21V9" />
      <path d="M7 14l5-5 5 5" />
      <path d="M5 21h14" />
    </svg>
  );
}

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
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarInputKey, setAvatarInputKey] = useState(0);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarUploadProgress, setAvatarUploadProgress] = useState<
    number | null
  >(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarVersion, setAvatarVersion] = useState(0);

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

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    let objectUrl: string | null = null;
    let cancelled = false;

    const loadAvatar = async () => {
      if (!profile?.hasAvatar || !token) {
        setAvatarUrl(null);
        return;
      }

      try {
        const response = await fetch(`${API_URL}/users/me/avatar`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok || cancelled) return;

        const blob = await response.blob();
        if (cancelled) return;

        objectUrl = URL.createObjectURL(blob);
        setAvatarUrl(objectUrl);
      } catch {
        // Fall back to initials if the avatar can't be fetched.
      }
    };

    void loadAvatar();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [profile?.hasAvatar, avatarVersion]);

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

  const handleAvatarFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setAvatarFile(event.target.files?.[0] ?? null);
    },
    [],
  );

  const handleUploadAvatar = useCallback(async () => {
    if (!avatarFile) return;

    const token = localStorage.getItem('accessToken');
    if (!token) {
      router.replace('/auth/login');
      return;
    }

    setAvatarError(null);

    if (!ALLOWED_AVATAR_MIME_TYPES.includes(avatarFile.type)) {
      setAvatarError('This file type is not supported.');
      return;
    }

    if (avatarFile.size > AVATAR_MAX_FILE_SIZE_BYTES) {
      setAvatarError('This file is too large to upload.');
      return;
    }

    setIsUploadingAvatar(true);
    setAvatarUploadProgress(0);

    try {
      const updated = await new Promise<UserProfile>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API_URL}/users/me/avatar`);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            setAvatarUploadProgress(
              Math.round((event.loaded / event.total) * 100),
            );
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText) as UserProfile);
          } else {
            reject(new AvatarUploadHttpError(xhr.status));
          }
        };
        xhr.onerror = () => reject(new AvatarUploadHttpError(0));

        const formData = new FormData();
        formData.append('file', avatarFile);
        xhr.send(formData);
      });

      setProfile(updated);
      setAvatarFile(null);
      setAvatarInputKey((key) => key + 1);
      setAvatarVersion((version) => version + 1);
    } catch (err) {
      const status =
        err instanceof AvatarUploadHttpError ? err.status : 0;
      if (status === 401) {
        localStorage.removeItem('accessToken');
        router.replace('/auth/login');
        return;
      }
      if (status === 413) {
        setAvatarError('This file is too large to upload.');
      } else if (status === 415) {
        setAvatarError('This file type is not supported.');
      } else {
        setAvatarError('Could not upload your avatar. Please try again.');
      }
    } finally {
      setIsUploadingAvatar(false);
      setAvatarUploadProgress(null);
    }
  }, [avatarFile, router]);

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
                {avatarUrl ? (
                  <Avatar.Image alt="Your avatar" src={avatarUrl} />
                ) : null}
                <Avatar.Fallback>
                  {getInitials(profile.name, profile.email)}
                </Avatar.Fallback>
              </Avatar>

              <div className="flex w-full flex-col gap-2">
                {avatarError ? (
                  <Alert status="danger">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Description>{avatarError}</Alert.Description>
                    </Alert.Content>
                  </Alert>
                ) : null}

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Input
                    key={avatarInputKey}
                    accept="image/jpeg,image/png"
                    aria-label="Choose avatar to upload"
                    className="flex-1"
                    disabled={isUploadingAvatar}
                    fullWidth
                    type="file"
                    onChange={handleAvatarFileChange}
                  />
                  <Button
                    isDisabled={!avatarFile}
                    isPending={isUploadingAvatar}
                    onPress={handleUploadAvatar}
                  >
                    {({ isPending }) =>
                      isPending ? (
                        <>
                          <Spinner color="current" size="sm" />
                          Upload avatar
                        </>
                      ) : (
                        <>
                          <UploadIcon aria-hidden="true" className="size-4" />
                          Upload avatar
                        </>
                      )
                    }
                  </Button>
                </div>

                {isUploadingAvatar && avatarUploadProgress !== null ? (
                  <ProgressBar
                    aria-label="Avatar upload progress"
                    value={avatarUploadProgress}
                  >
                    <ProgressBar.Output />
                    <ProgressBar.Track>
                      <ProgressBar.Fill />
                    </ProgressBar.Track>
                  </ProgressBar>
                ) : null}
              </div>

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
