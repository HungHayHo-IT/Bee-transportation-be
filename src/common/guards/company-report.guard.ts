import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { isCompanyWide } from '../scope/is-company-wide';
import { RequestWithUser } from '../types/authenticated-user.type';

/** Chỉ tầng công ty. Dùng cho endpoint phơi số liệu toàn công ty. */
@Injectable()
export class CompanyReportGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const { user } = ctx.switchToHttp().getRequest<RequestWithUser>();
    if (!user || !isCompanyWide(user))
      throw new ForbiddenException('Bạn không có quyền xem báo cáo công ty');
    return true;
  }
}
