import { Injectable } from '@nestjs/common';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import convert from 'heic-convert';

export type StoredFile = {
  fileName: string;
  storagePath: string;
  publicUrl: string;
  mimeType: string;
  size: number;
};

@Injectable()
export class StorageService {
  private readonly rootDir = join(process.cwd(), 'data', 'uploads');

  async save(category: 'walls' | 'utilities', file: Express.Multer.File): Promise<StoredFile> {
    const dir = join(this.rootDir, category);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const normalized = await this.normalizeFile(file);
    const extension = normalized.extension;
    const fileName = `${randomUUID()}${extension}`;
    const storagePath = join(dir, fileName);
    writeFileSync(storagePath, normalized.buffer);

    return {
      fileName,
      storagePath,
      publicUrl: `/files/${category}/${fileName}`,
      mimeType: normalized.mimeType,
      size: normalized.buffer.length,
    };
  }

  private async normalizeFile(file: Express.Multer.File) {
    if (this.isHeic(file)) {
      const output = await convert({
        buffer: file.buffer,
        format: 'JPEG',
        quality: 0.92,
      });

      return {
        buffer: Buffer.from(output),
        extension: '.jpg',
        mimeType: 'image/jpeg',
      };
    }

    return {
      buffer: file.buffer,
      extension: extname(file.originalname) || this.extensionFromMime(file.mimetype),
      mimeType: file.mimetype || 'application/octet-stream',
    };
  }

  private isHeic(file: Express.Multer.File) {
    const extension = extname(file.originalname).toLowerCase();
    return ['.heic', '.heif'].includes(extension) || ['image/heic', 'image/heif'].includes(file.mimetype);
  }

  private extensionFromMime(mimeType: string) {
    const known: Record<string, string> = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'image/avif': '.avif',
      'image/svg+xml': '.svg',
      'image/bmp': '.bmp',
      'image/tiff': '.tif',
    };

    return known[mimeType] ?? '.bin';
  }
}
