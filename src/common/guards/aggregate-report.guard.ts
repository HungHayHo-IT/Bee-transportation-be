import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ScopeService } from '../scope/scope.service';
import { RequestWithUser } from '../types/authenticated-user.type';

/**
 * CHẶN TẦNG CÁ NHÂN, không phải "chỉ cho tầng công ty".
 * Trưởng phòng phải xem được hiệu suất phòng mình — dùng CompanyReportGuard ở đây
 * sẽ khiến họ ăn 403.
 */
@Injectable()
export class AggregateReportGuard implements CanActivate {
  constructor(private readonly scope: ScopeService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const { user } = ctx.switchToHttp().getRequest<RequestWithUser>();
    if (!user || this.scope.reportScope(user).level === 'personal')
      throw new ForbiddenException('Bạn không có quyền xem báo cáo tổng hợp');
    return true;
  }
}
