import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';
import { CanActivate, ExecutionContext, HttpException, Injectable, VERSION_NEUTRAL } from '@nestjs/common';
import { VERSION_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import {
  CLIENT_VERSION_HEADER,
  MIN_CLIENT_VERSION_REASON,
  compareSemver,
  resolveMinClientVersion,
} from './client-version.constants';

type HeaderBag = Record<string, string | string[] | undefined> | IncomingHttpHeaders;

function evaluateClientVersion(headers: HeaderBag): { blocked: boolean; minimum: string } {
  const headerValue = headers[CLIENT_VERSION_HEADER.toLowerCase()];
  const clientVersion = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  const minimum = resolveMinClientVersion();
  if (!clientVersion) return { blocked: false, minimum };

  try {
    return { blocked: compareSemver(clientVersion, minimum) < 0, minimum };
  } catch {
    // A parse failure on the client-supplied value must not strand a caller.
    return { blocked: false, minimum };
  }
}

interface RequestWithHeaders {
  headers: Record<string, string | string[] | undefined>;
}

@Injectable()
export class MinClientVersionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // VERSION_METADATA isn't re-exported from '@nestjs/common's public index, but it's the literal
    // key Nest's own router reads for @Controller({ version }) — this is how a guard recognises a
    // VERSION_NEUTRAL route without a second, redundant marker decorator.
    const routeVersion = this.reflector.getAllAndOverride<string | symbol | undefined>(VERSION_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (routeVersion === VERSION_NEUTRAL) return true;

    const request = context.switchToHttp().getRequest<RequestWithHeaders>();
    const { blocked, minimum } = evaluateClientVersion(request.headers);
    if (blocked) {
      throw new HttpException({ reason: MIN_CLIENT_VERSION_REASON, minimum }, 426);
    }
    return true;
  }
}

// Better Auth mounts its routes via `httpAdapter.use(...)` directly (see AuthModule.configure in
// @thallesp/nestjs-better-auth), not as Nest controllers — they never reach the router or any
// CanActivate guard, including MinClientVersionGuard above. This applies the identical floor check
// ahead of Better Auth's own handler for that one path prefix, so the guarantee holds for every
// route the client calls, not only the Nest-routed ones. Registered in main.ts via `app.use(...)`
// before `app.listen()`, which puts it earlier in the underlying HTTP stack than AuthModule's own
// middleware (attached later, during `app.init()` inside `listen()`).
export function minClientVersionMiddleware(pathPrefix: string) {
  return (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void): void => {
    if (!req.url || !req.url.startsWith(pathPrefix)) {
      next();
      return;
    }

    const { blocked, minimum } = evaluateClientVersion(req.headers);
    if (blocked) {
      res.statusCode = 426;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ reason: MIN_CLIENT_VERSION_REASON, minimum }));
      return;
    }
    next();
  };
}
