import { CanActivate, ExecutionContext, HttpException, Injectable, VERSION_NEUTRAL } from '@nestjs/common';
import { VERSION_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import {
  CLIENT_VERSION_HEADER,
  MIN_CLIENT_VERSION_REASON,
  compareSemver,
  resolveMinClientVersion,
} from './client-version.constants';

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
    const headerValue = request.headers[CLIENT_VERSION_HEADER.toLowerCase()];
    const clientVersion = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    if (!clientVersion) return true;

    const minimum = resolveMinClientVersion();
    let comparison: number;
    try {
      comparison = compareSemver(clientVersion, minimum);
    } catch {
      // A parse failure on the client-supplied value must not strand a caller.
      return true;
    }

    if (comparison < 0) {
      throw new HttpException({ reason: MIN_CLIENT_VERSION_REASON, minimum }, 426);
    }
    return true;
  }
}
