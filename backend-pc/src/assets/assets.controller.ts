import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { AuthGuard } from '../auth/auth.guard';
import type { AuthenticatedRequest } from '../auth/auth.guard';
import { DatabaseService, AssetRow } from '../database/database.service';
import { StorageService } from '../storage/storage.service';

@Controller()
export class AssetsController {
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: StorageService,
  ) {}

  @Get('assets')
  @UseGuards(AuthGuard)
  list(@Req() request: AuthenticatedRequest) {
    return this.database.all<AssetRow>(
      `SELECT * FROM assets
       WHERE kind = 'UTILITY' OR owner_id = $ownerId
       ORDER BY created_at DESC`,
      { $ownerId: request.user.id },
    );
  }

  @Post('assets/walls')
  @UseGuards(AuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  async uploadWall(@Req() request: AuthenticatedRequest, @UploadedFile() file: Express.Multer.File) {
    const saved = await this.storage.save('walls', file);
    return this.createAsset({
      ownerId: request.user.id,
      kind: 'WALL',
      name: file.originalname,
      file,
      saved,
    });
  }

  @Post('assets/utilities')
  @UseGuards(AuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  async uploadUtility(@UploadedFile() file: Express.Multer.File) {
    const saved = await this.storage.save('utilities', file);
    return this.createAsset({
      ownerId: null,
      kind: 'UTILITY',
      name: file.originalname,
      file,
      saved,
    });
  }

  @Get('files/:category/:fileName')
  file(@Param('category') category: string, @Param('fileName') fileName: string, @Res() response: Response) {
    if (!['walls', 'utilities'].includes(category) || fileName.includes('..')) {
      throw new NotFoundException();
    }

    const filePath = resolve(join(process.cwd(), 'data', 'uploads', category, fileName));
    if (!existsSync(filePath)) {
      throw new NotFoundException();
    }

    return response.sendFile(filePath);
  }

  private createAsset(input: {
    ownerId: number | null;
    kind: 'WALL' | 'UTILITY';
    name: string;
    file: Express.Multer.File;
    saved: { storagePath: string; publicUrl: string; mimeType: string; size: number };
  }) {
    const result = this.database.run(
      `INSERT INTO assets (owner_id, kind, name, original_name, mime_type, size, storage_path, public_url)
       VALUES ($ownerId, $kind, $name, $originalName, $mimeType, $size, $storagePath, $publicUrl)`,
      {
        $ownerId: input.ownerId,
        $kind: input.kind,
        $name: input.name,
        $originalName: input.file.originalname,
        $mimeType: input.saved.mimeType,
        $size: input.saved.size,
        $storagePath: input.saved.storagePath,
        $publicUrl: input.saved.publicUrl,
      },
    );

    return this.database.get<AssetRow>('SELECT * FROM assets WHERE id = $id', {
      $id: Number(result.lastInsertRowid),
    });
  }
}
