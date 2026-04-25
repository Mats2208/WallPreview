import { Module } from '@nestjs/common';
import { AccountsController } from './accounts/accounts.controller';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AssetsController } from './assets/assets.controller';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { AuthService } from './auth/auth.service';
import { DatabaseService } from './database/database.service';
import { ProjectsController } from './projects/projects.controller';
import { StorageService } from './storage/storage.service';

@Module({
  imports: [],
  controllers: [AppController, AuthController, AccountsController, AssetsController, ProjectsController],
  providers: [AppService, DatabaseService, AuthService, AuthGuard, StorageService],
})
export class AppModule {}
