import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { VersioningType } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  // bodyParser: false is required by @thallesp/nestjs-better-auth — Better Auth needs the raw
  // request. The module re-adds JSON and URL-encoded parsers for every non-auth route.
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
