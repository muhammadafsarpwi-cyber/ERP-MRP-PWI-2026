import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';

type RateLimitBucket = { count: number; resetAt: number };

/**
 * Small, dependency-free protection for public auth endpoints. A shared store
 * such as Redis should replace this guard before running multiple instances.
 */
@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, RateLimitBucket>();
  private readonly windowMs = 15 * 60 * 1000;
  private readonly maxRequests = 10;

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const route = request.route?.path || request.path || 'auth';
    const clientIp = request.ip || request.socket?.remoteAddress || 'unknown';
    const email = typeof request.body?.email === 'string' ? request.body.email.toLowerCase() : '';
    const key = `${route}:${clientIp}:${email}`;
    const now = Date.now();
    const current = this.buckets.get(key);

    if (!current || current.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }

    if (current.count >= this.maxRequests) {
      throw new HttpException('Too many attempts. Please try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }

    current.count += 1;
    return true;
  }
}
