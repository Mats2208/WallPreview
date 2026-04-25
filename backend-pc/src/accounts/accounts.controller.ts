import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { AuthGuard } from '../auth/auth.guard';
import type { AuthenticatedRequest } from '../auth/auth.guard';
import { DatabaseService, UserRow } from '../database/database.service';

@Controller('accounts')
@UseGuards(AuthGuard)
export class AccountsController {
  constructor(
    private readonly auth: AuthService,
    private readonly database: DatabaseService,
  ) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    this.requireAdmin(request);
    return this.database
      .all<UserRow>('SELECT * FROM users ORDER BY created_at DESC')
      .map((user) => this.auth.publicUser(user));
  }

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() body: { email: string; name: string; password: string }) {
    this.requireAdmin(request);
    return this.auth.register(body.email, body.name, body.password).user;
  }

  @Patch(':id')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { email?: string; name?: string; password?: string; role?: 'ADMIN' | 'USER' },
  ) {
    this.requireAdmin(request);
    const user = this.database.get<UserRow>('SELECT * FROM users WHERE id = $id', { $id: Number(id) });
    const passwordHash = body.password ? this.database.hashPassword(body.password) : user?.password_hash;

    this.database.run(
      `UPDATE users
       SET email = $email, name = $name, password_hash = $passwordHash, role = $role, updated_at = CURRENT_TIMESTAMP
       WHERE id = $id`,
      {
        $email: body.email?.trim().toLowerCase() ?? user?.email,
        $name: body.name?.trim() ?? user?.name,
        $passwordHash: passwordHash,
        $role: body.role ?? user?.role,
        $id: Number(id),
      },
    );

    const updated = this.database.get<UserRow>('SELECT * FROM users WHERE id = $id', { $id: Number(id) });
    return this.auth.publicUser(updated!);
  }

  @Delete(':id')
  remove(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    this.requireAdmin(request);
    this.database.run('DELETE FROM users WHERE id = $id', { $id: Number(id) });
    return { ok: true };
  }

  private requireAdmin(request: AuthenticatedRequest) {
    if (request.user.role !== 'ADMIN') {
      throw new ForbiddenException('Admin role required');
    }
  }
}
