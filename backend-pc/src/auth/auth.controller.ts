import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import type { AuthenticatedRequest } from './auth.guard';
import { DatabaseService, UserRow } from '../database/database.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly database: DatabaseService,
  ) {}

  @Post('register')
  register(@Body() body: { email: string; name: string; password: string }) {
    return this.auth.register(body.email, body.name, body.password);
  }

  @Post('login')
  login(@Body() body: { email: string; password: string }) {
    return this.auth.login(body.email, body.password);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@Req() request: AuthenticatedRequest) {
    return this.auth.publicUser(request.user);
  }

  @Patch('me')
  @UseGuards(AuthGuard)
  updateMe(
    @Req() request: AuthenticatedRequest,
    @Body() body: { email?: string; name?: string; password?: string },
  ) {
    const email = body.email?.trim().toLowerCase() ?? request.user.email;
    const name = body.name?.trim() ?? request.user.name;
    const passwordHash = body.password ? this.database.hashPassword(body.password) : request.user.password_hash;

    this.database.run(
      `UPDATE users
       SET email = $email, name = $name, password_hash = $passwordHash, updated_at = CURRENT_TIMESTAMP
       WHERE id = $id`,
      {
        $email: email,
        $name: name,
        $passwordHash: passwordHash,
        $id: request.user.id,
      },
    );

    const updated = this.database.get<UserRow>('SELECT * FROM users WHERE id = $id', { $id: request.user.id });
    return this.auth.publicUser(updated!);
  }
}
