import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

/**
 * IsEmailVerifiedGuard
 *
 * Must be used AFTER JwtAuthGuard — it depends on req.user being populated.
 * Blocks any request from a user whose email has not been verified.
 *
 * Usage:
 *   @UseGuards(JwtAuthGuard, IsEmailVerifiedGuard)
 */
@Injectable()
export class IsEmailVerifiedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();

    if (!user?.emailVerified) {
      throw new ForbiddenException(
        'Please verify your email address before performing transactions. ' +
        'Check your inbox or request a new verification email at POST /auth/resend-verification',
      );
    }

    return true;
  }
}