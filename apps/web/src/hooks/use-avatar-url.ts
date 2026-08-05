'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * Fetches the current user's avatar as a blob URL whenever `hasAvatar`
 * (or `version`, bumped after a new upload) changes. A new URL is created
 * before the previous one is revoked, so an in-flight replacement never
 * points `<Avatar.Image>` at an already-revoked blob URL.
 */
export function useAvatarUrl(
  hasAvatar: boolean | undefined,
  version = 0,
): string | null {
  const router = useRouter();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const currentUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    let cancelled = false;

    const loadAvatar = async () => {
      if (!hasAvatar || !token) {
        if (currentUrlRef.current) {
          URL.revokeObjectURL(currentUrlRef.current);
          currentUrlRef.current = null;
        }
        setAvatarUrl(null);
        return;
      }

      try {
        const response = await fetch(`${API_URL}/users/me/avatar`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.status === 401) {
          localStorage.removeItem('accessToken');
          router.replace('/auth/login');
          return;
        }

        if (!response.ok || cancelled) return;

        const blob = await response.blob();
        if (cancelled) return;

        const previousUrl = currentUrlRef.current;
        const objectUrl = URL.createObjectURL(blob);
        currentUrlRef.current = objectUrl;
        setAvatarUrl(objectUrl);
        if (previousUrl) URL.revokeObjectURL(previousUrl);
      } catch {
        // Fall back to initials if the avatar can't be fetched.
      }
    };

    void loadAvatar();

    return () => {
      cancelled = true;
    };
  }, [hasAvatar, version, router]);

  useEffect(() => {
    return () => {
      if (currentUrlRef.current) URL.revokeObjectURL(currentUrlRef.current);
    };
  }, []);

  return avatarUrl;
}
