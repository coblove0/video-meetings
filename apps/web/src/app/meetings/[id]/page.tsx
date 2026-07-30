'use client';

import { useParams, useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type SVGProps,
} from 'react';
import {
  Alert,
  AlertDialog,
  Button,
  Card,
  Input,
  Link,
  ProgressBar,
  Spinner,
  Table,
} from '@heroui/react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

class UploadHttpError extends Error {
  constructor(readonly status: number) {
    super(`Upload failed with status ${status}`);
  }
}

interface Meeting {
  id: string;
  title: string;
  date: string;
  participants: string[];
}

interface MeetingFile {
  id: string;
  originalName: string;
  size: number;
  mimeType: string;
  createdAt: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function ArrowLeftIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  );
}

function DownloadIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
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

function TrashIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

export default function MeetingPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const meetingId = params.id;

  const [isLoading, setIsLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [files, setFiles] = useState<MeetingFile[]>([]);
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(
    null,
  );
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      router.replace('/auth/login');
      return;
    }

    const controller = new AbortController();

    const load = async () => {
      setIsLoading(true);
      setAccessDenied(false);
      setError(null);

      try {
        const [meetingResponse, filesResponse] = await Promise.all([
          fetch(`${API_URL}/meetings/${meetingId}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          }),
          fetch(`${API_URL}/meetings/${meetingId}/files`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          }),
        ]);

        if (controller.signal.aborted) return;

        if (meetingResponse.status === 401 || filesResponse.status === 401) {
          localStorage.removeItem('accessToken');
          router.replace('/auth/login');
          return;
        }

        if (meetingResponse.status === 404 || filesResponse.status === 404) {
          setAccessDenied(true);
          return;
        }

        if (!meetingResponse.ok || !filesResponse.ok) {
          setError('Could not load this meeting.');
          return;
        }

        const meetingData: Meeting = await meetingResponse.json();
        const filesData: MeetingFile[] = await filesResponse.json();
        setMeeting(meetingData);
        setFiles(filesData);
      } catch {
        if (controller.signal.aborted) return;
        setError('Unable to reach the server. Please check your connection.');
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };

    void load();

    return () => controller.abort();
  }, [meetingId, router, reloadKey]);

  const handleDownload = useCallback(
    async (file: MeetingFile) => {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        router.replace('/auth/login');
        return;
      }

      setActionError(null);
      setDownloadingFileId(file.id);

      try {
        const response = await fetch(
          `${API_URL}/meetings/${meetingId}/files/${file.id}/download`,
          { headers: { Authorization: `Bearer ${token}` } },
        );

        if (!response.ok) {
          setActionError(`Could not download "${file.originalName}".`);
          return;
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.originalName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        // Deferred: revoking synchronously can cut off the download in
        // browsers (Firefox/Safari) that haven't finished reading the blob yet.
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch {
        setActionError('Unable to reach the server. Please try again.');
      } finally {
        setDownloadingFileId(null);
      }
    },
    [meetingId, router],
  );

  const handleDelete = useCallback(
    async (file: MeetingFile, onSettled: () => void) => {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        router.replace('/auth/login');
        return;
      }

      setActionError(null);
      setDeletingFileId(file.id);

      try {
        const response = await fetch(
          `${API_URL}/meetings/${meetingId}/files/${file.id}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          },
        );

        if (!response.ok) {
          setActionError(`Could not delete "${file.originalName}".`);
          return;
        }

        setFiles((prev) => prev.filter((item) => item.id !== file.id));
      } catch {
        setActionError('Unable to reach the server. Please try again.');
      } finally {
        setDeletingFileId(null);
        onSettled();
      }
    },
    [meetingId, router],
  );

  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setSelectedFile(event.target.files?.[0] ?? null);
    },
    [],
  );

  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;

    const token = localStorage.getItem('accessToken');
    if (!token) {
      router.replace('/auth/login');
      return;
    }

    setActionError(null);
    setIsUploading(true);
    setUploadProgress(0);

    try {
      const uploadedFile = await new Promise<MeetingFile>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API_URL}/meetings/${meetingId}/files`);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            setUploadProgress(Math.round((event.loaded / event.total) * 100));
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText) as MeetingFile);
          } else {
            reject(new UploadHttpError(xhr.status));
          }
        };
        xhr.onerror = () => reject(new UploadHttpError(0));

        const formData = new FormData();
        formData.append('file', selectedFile);
        xhr.send(formData);
      });

      setFiles((prev) => [...prev, uploadedFile]);
      setSelectedFile(null);
      setFileInputKey((key) => key + 1);
    } catch (err) {
      const status = err instanceof UploadHttpError ? err.status : 0;
      if (status === 413) {
        setActionError('This file is too large to upload.');
      } else if (status === 415) {
        setActionError('This file type is not supported.');
      } else {
        setActionError('Could not upload the file. Please try again.');
      }
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  }, [selectedFile, meetingId, router]);

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
      <div className="flex w-full max-w-3xl flex-col gap-4 sm:gap-6">
        <Link className="flex w-fit items-center gap-1 text-sm" href="/">
          <ArrowLeftIcon aria-hidden="true" className="size-4" />
          Back to meetings
        </Link>

        {accessDenied ? (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>Access denied</Alert.Title>
              <Alert.Description>
                You don&apos;t have permission to view this meeting.
              </Alert.Description>
            </Alert.Content>
          </Alert>
        ) : error ? (
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
        ) : meeting ? (
          <>
            <div>
              <h1 className="text-foreground text-xl font-semibold tracking-tight sm:text-2xl">
                {meeting.title}
              </h1>
              <p className="text-muted text-sm">{formatDate(meeting.date)}</p>
            </div>

            {actionError ? (
              <Alert status="danger">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Description>{actionError}</Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null}

            <Card className="w-full shadow-xl">
              <Card.Header>
                <Card.Title>Upload a file</Card.Title>
              </Card.Header>
              <Card.Content>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Input
                    key={fileInputKey}
                    aria-label="Choose file to upload"
                    className="flex-1"
                    disabled={isUploading}
                    fullWidth
                    type="file"
                    onChange={handleFileChange}
                  />
                  <Button
                    isDisabled={!selectedFile}
                    isPending={isUploading}
                    onPress={handleUpload}
                  >
                    <UploadIcon aria-hidden="true" className="size-4" />
                    Upload
                  </Button>
                </div>
                {isUploading && uploadProgress !== null ? (
                  <ProgressBar
                    aria-label="Upload progress"
                    className="mt-3 w-full"
                    value={uploadProgress}
                  >
                    <ProgressBar.Output />
                    <ProgressBar.Track>
                      <ProgressBar.Fill />
                    </ProgressBar.Track>
                  </ProgressBar>
                ) : null}
              </Card.Content>
            </Card>

            <Card className="w-full shadow-xl">
              <Card.Header>
                <Card.Title>Files</Card.Title>
                <Card.Description>
                  {files.length} {files.length === 1 ? 'file' : 'files'}
                </Card.Description>
              </Card.Header>

              <Card.Content>
                {files.length === 0 ? (
                  <p className="text-muted text-sm">
                    No files have been uploaded to this meeting yet.
                  </p>
                ) : (
                  <Table>
                    <Table.ScrollContainer>
                      <Table.Content
                        aria-label="Meeting files"
                        className="min-w-[560px]"
                      >
                        <Table.Header>
                          <Table.Column isRowHeader>Name</Table.Column>
                          <Table.Column>Size</Table.Column>
                          <Table.Column>Type</Table.Column>
                          <Table.Column>Uploaded</Table.Column>
                          <Table.Column>Actions</Table.Column>
                        </Table.Header>
                        <Table.Body>
                          {files.map((file) => (
                            <Table.Row key={file.id}>
                              <Table.Cell>{file.originalName}</Table.Cell>
                              <Table.Cell>
                                {formatFileSize(file.size)}
                              </Table.Cell>
                              <Table.Cell>{file.mimeType}</Table.Cell>
                              <Table.Cell>
                                {formatDate(file.createdAt)}
                              </Table.Cell>
                              <Table.Cell>
                                <div className="flex items-center gap-1">
                                  <Button
                                    isIconOnly
                                    aria-label={`Download ${file.originalName}`}
                                    isPending={downloadingFileId === file.id}
                                    size="sm"
                                    variant="ghost"
                                    onPress={() => handleDownload(file)}
                                  >
                                    <DownloadIcon
                                      aria-hidden="true"
                                      className="size-4"
                                    />
                                  </Button>
                                  <AlertDialog>
                                    <Button
                                      isIconOnly
                                      aria-label={`Delete ${file.originalName}`}
                                      size="sm"
                                      variant="ghost"
                                    >
                                      <TrashIcon
                                        aria-hidden="true"
                                        className="size-4"
                                      />
                                    </Button>
                                    <AlertDialog.Backdrop>
                                      <AlertDialog.Container>
                                        <AlertDialog.Dialog className="sm:max-w-[400px]">
                                          {(renderProps) => (
                                            <>
                                              <AlertDialog.CloseTrigger />
                                              <AlertDialog.Header>
                                                <AlertDialog.Icon status="danger" />
                                                <AlertDialog.Heading>
                                                  Delete this file?
                                                </AlertDialog.Heading>
                                              </AlertDialog.Header>
                                              <AlertDialog.Body>
                                                <p>
                                                  This will permanently delete{' '}
                                                  <strong>
                                                    {file.originalName}
                                                  </strong>
                                                  . This action cannot be
                                                  undone.
                                                </p>
                                              </AlertDialog.Body>
                                              <AlertDialog.Footer>
                                                <Button
                                                  slot="close"
                                                  variant="tertiary"
                                                >
                                                  Cancel
                                                </Button>
                                                <Button
                                                  isPending={
                                                    deletingFileId === file.id
                                                  }
                                                  variant="danger"
                                                  onPress={() =>
                                                    handleDelete(
                                                      file,
                                                      renderProps.close,
                                                    )
                                                  }
                                                >
                                                  Delete
                                                </Button>
                                              </AlertDialog.Footer>
                                            </>
                                          )}
                                        </AlertDialog.Dialog>
                                      </AlertDialog.Container>
                                    </AlertDialog.Backdrop>
                                  </AlertDialog>
                                </div>
                              </Table.Cell>
                            </Table.Row>
                          ))}
                        </Table.Body>
                      </Table.Content>
                    </Table.ScrollContainer>
                  </Table>
                )}
              </Card.Content>
            </Card>
          </>
        ) : null}
      </div>
    </main>
  );
}
