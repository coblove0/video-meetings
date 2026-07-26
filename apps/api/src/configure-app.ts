import { INestApplication, ValidationPipe } from '@nestjs/common';

export function configureApp<T extends INestApplication>(app: T): T {
  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  return app;
}
