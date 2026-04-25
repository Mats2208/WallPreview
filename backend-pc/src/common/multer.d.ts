declare namespace Express {
  namespace Multer {
    type File = {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
      size: number;
    };
  }
}
