import { UnsupportedMediaTypeException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { diskStorage, FileFilterCallback } from 'multer';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import type { Request } from 'express';

export const AVATAR_UPLOAD_DIR =
  process.env.AVATAR_UPLOAD_DIR ?? './uploads/avatars';

export const AVATAR_MAX_FILE_SIZE_BYTES = Number(
  process.env.AVATAR_MAX_FILE_SIZE_BYTES ?? 5242880,
);

export const ALLOWED_AVATAR_MIME_TYPES = (
  process.env.ALLOWED_AVATAR_MIME_TYPES ?? 'image/jpeg,image/png'
).split(',');

const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
};

if (!existsSync(AVATAR_UPLOAD_DIR)) {
  mkdirSync(AVATAR_UPLOAD_DIR, { recursive: true });
}

export const avatarMulterOptions: MulterOptions = {
  storage: diskStorage({
    destination: AVATAR_UPLOAD_DIR,
    filename: (_req, file, cb) => {
      cb(null, `${randomUUID()}${EXTENSION_BY_MIME_TYPE[file.mimetype] ?? ''}`);
    },
  }),
  limits: { fileSize: AVATAR_MAX_FILE_SIZE_BYTES, files: 1 },
  fileFilter: (
    _req: Request,
    file: Express.Multer.File,
    cb: FileFilterCallback,
  ) => {
    if (!ALLOWED_AVATAR_MIME_TYPES.includes(file.mimetype)) {
      cb(new UnsupportedMediaTypeException('File type not allowed'));
      return;
    }
    cb(null, true);
  },
};
