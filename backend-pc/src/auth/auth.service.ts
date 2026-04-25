import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { DatabaseService, UserRow } from '../database/database.service';

type TokenPayload = {
  sub: number;
  email: string;
  role: 'ADMIN' | 'USER';
  exp: number;
};

@Injectable()
export class AuthService {
  private readonly secret = process.env.JWT_SECRET ?? 'wallpreview-dev-secret';

  constructor(private readonly database: DatabaseService) {}

  register(email: string, name: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const existing = this.database.get<UserRow>('SELECT * FROM users WHERE email = $email', {
      $email: normalizedEmail,
    });

    if (existing) {
      throw new UnauthorizedException('Email already registered');
    }

    const result = this.database.run(
      `INSERT INTO users (email, name, password_hash, role)
       VALUES ($email, $name, $passwordHash, 'USER')`,
      {
        $email: normalizedEmail,
        $name: name.trim(),
        $passwordHash: this.database.hashPassword(password),
      },
    );

    const user = this.database.get<UserRow>('SELECT * FROM users WHERE id = $id', {
      $id: Number(result.lastInsertRowid),
    });

    return this.session(user!);
  }

  login(email: string, password: string) {
    const user = this.database.get<UserRow>('SELECT * FROM users WHERE email = $email', {
      $email: email.trim().toLowerCase(),
    });

    if (!user || !this.database.verifyPassword(password, user.password_hash)) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.session(user);
  }

  verifyToken(token: string) {
    const [header, payload, signature] = token.split('.');
    if (!header || !payload || !signature) {
      throw new UnauthorizedException('Invalid token');
    }

    const expected = this.sign(`${header}.${payload}`);
    if (signature !== expected) {
      throw new UnauthorizedException('Invalid token');
    }

    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as TokenPayload;
    if (parsed.exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Expired token');
    }

    return parsed;
  }

  publicUser(user: UserRow) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    };
  }

  private session(user: UserRow) {
    return {
      token: this.issueToken(user),
      user: this.publicUser(user),
    };
  }

  private issueToken(user: UserRow) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: user.id,
        email: user.email,
        role: user.role,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
      }),
    ).toString('base64url');

    return `${header}.${payload}.${this.sign(`${header}.${payload}`)}`;
  }

  private sign(value: string) {
    return createHmac('sha256', this.secret).update(value).digest('base64url');
  }
}
