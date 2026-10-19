import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SKIP_PASSWORD_CHECK } from '../decorators/skip-password-check.decorator';
import { RequestWithUser } from '../types/authenticated-user.type';

@Injectable()
export class MustChangePasswordGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;
    if (this.reflector.getAllAndOverride<boolean>(SKIP_PASSWORD_CHECK, targets)) return true;

    const { user } = ctx.switchToHttp().getRequest<RequestWithUser>();
    if (user?.mustChangePassword)
      throw new ForbiddenException('Bạn cần đổi mật khẩu trước khi sử dụng hệ thống');
    return true;
  }
}
