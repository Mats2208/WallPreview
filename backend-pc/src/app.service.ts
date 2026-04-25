import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'WallPreview API: auth, accounts, image assets, utilities and projects.';
  }
}
