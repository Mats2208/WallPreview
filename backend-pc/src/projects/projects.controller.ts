import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import type { AuthenticatedRequest } from '../auth/auth.guard';
import { DatabaseService, ProjectRow } from '../database/database.service';

@Controller('projects')
@UseGuards(AuthGuard)
export class ProjectsController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.database.all<ProjectRow>(
      'SELECT * FROM projects WHERE owner_id = $ownerId ORDER BY updated_at DESC',
      { $ownerId: request.user.id },
    );
  }

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body() body: { name: string; wallAssetId?: number | null; scene?: unknown },
  ) {
    const result = this.database.run(
      `INSERT INTO projects (owner_id, name, wall_asset_id, scene_json)
       VALUES ($ownerId, $name, $wallAssetId, $sceneJson)`,
      {
        $ownerId: request.user.id,
        $name: body.name?.trim() || 'Untitled project',
        $wallAssetId: body.wallAssetId ?? null,
        $sceneJson: JSON.stringify(body.scene ?? { layers: [] }),
      },
    );

    return this.database.get<ProjectRow>('SELECT * FROM projects WHERE id = $id', {
      $id: Number(result.lastInsertRowid),
    });
  }

  @Patch(':id')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { name?: string; wallAssetId?: number | null; scene?: unknown },
  ) {
    const current = this.database.get<ProjectRow>(
      'SELECT * FROM projects WHERE id = $id AND owner_id = $ownerId',
      { $id: Number(id), $ownerId: request.user.id },
    );

    this.database.run(
      `UPDATE projects
       SET name = $name, wall_asset_id = $wallAssetId, scene_json = $sceneJson, updated_at = CURRENT_TIMESTAMP
       WHERE id = $id AND owner_id = $ownerId`,
      {
        $name: body.name ?? current?.name,
        $wallAssetId: body.wallAssetId ?? current?.wall_asset_id ?? null,
        $sceneJson: body.scene ? JSON.stringify(body.scene) : current?.scene_json,
        $id: Number(id),
        $ownerId: request.user.id,
      },
    );

    return this.database.get<ProjectRow>('SELECT * FROM projects WHERE id = $id', { $id: Number(id) });
  }

  @Delete(':id')
  remove(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    this.database.run('DELETE FROM projects WHERE id = $id AND owner_id = $ownerId', {
      $id: Number(id),
      $ownerId: request.user.id,
    });
    return { ok: true };
  }
}
