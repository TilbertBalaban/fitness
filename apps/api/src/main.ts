import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { VersioningType } from '@nestjs/common';
import { AppModule } from './app.module';
import { AUTH_BASE_PATH } from './auth/auth';
import { minClientVersionMiddleware } from './common/min-client-version.guard';

async function bootstrap() {
  // bodyParser: false is required by @thallesp/nestjs-better-auth — Better Auth needs the raw
  // request. The module re-adds JSON and URL-encoded parsers for every non-auth route.
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  // Better Auth's routes are mounted as middleware ahead of Nest's router, so
  // MinClientVersionGuard (a CanActivate) never runs for them. Must be registered before
  // app.listen() — AuthModule attaches its own middleware during app.init(), inside listen().
  app.use(minClientVersionMiddleware(AUTH_BASE_PATH));

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
