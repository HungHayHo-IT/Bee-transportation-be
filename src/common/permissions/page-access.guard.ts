import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedUser } from '../types/authenticated-user.type';
import { PermissionMatrixService } from './permission-matrix.service';
import { quyetDinh } from './permission-matrix.helper';
import { MucQuyen } from './pages';

/** Thứ tự mức quyền để chọn cái cao nhất khi endpoint khai nhiều trang. */
const THU_TU: Record<MucQuyen, number> = {
  [MucQuyen.KHONG]: 0,
  [MucQuyen.XEM]: 1,
  [MucQuyen.SUA]: 2,
  [MucQuyen.DAY_DU]: 3,
};
import { TRANG_KEY } from './page.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/* Câu báo lỗi nói đúng bậc đang vướng: "chỉ được xem" khác hẳn "được sửa
   nhưng không được xoá", và người đọc cần biết mình thiếu cái nào để đi xin
   đúng thứ đó. */
const LY_DO: Record<MucQuyen, string> = {
  [MucQuyen.KHONG]: 'Vai trò của bạn không có quyền vào trang này',
  [MucQuyen.XEM]: 'Vai trò của bạn chỉ được xem trang này',
  [MucQuyen.SUA]: 'Vai trò của bạn không được xoá ở trang này',
  [MucQuyen.DAY_DU]: 'Vai trò của bạn không có quyền thực hiện thao tác này',
};

interface RequestWithUser {
  user?: AuthenticatedUser;
  method: string;
}

/**
 * Chặn theo MA TRẬN PHÂN QUYỀN, không theo danh sách vai trò viết trong code.
 *
 * Endpoint nào có `@Trang('...')` thì đi qua đây: mức quyền của người gọi trên
 * trang đó quyết định cho qua hay 403. Endpoint KHÔNG khai trang thì guard này
 * không đụng tới — nó vẫn được các guard cũ (@Roles) bảo vệ như trước.
 *
 * Vì sao không tự chặn mọi thứ chưa khai: một guard tự chặn thứ nó chưa biết
 * sẽ giết mọi tính năng mới ngay lúc deploy, và người sửa sẽ đi tìm lỗi ở chỗ
 * khác. Chuyển dần từng nhóm endpoint sang đây là cách đổi có thể dừng lại
 * giữa chừng mà hệ thống vẫn đứng.
 */
@Injectable()
export class PageAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly matrix: PermissionMatrixService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    /* Endpoint công khai đi trước mọi thứ: landing và form báo giá của khách
       gọi vào đây mà không có tài khoản nào, chặn chúng bằng ma trận nội bộ là
       tắt trang công khai. Khai @Public là đã nói rõ "ai cũng gọi được". */
    const congKhai = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (congKhai) return true;

    const trang = this.reflector.getAllAndOverride<string[] | undefined>(TRANG_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    // Mảng rỗng là CỐ Ý: endpoint khai `@Trang()` để nói "mở cho mọi tài khoản
    // đã đăng nhập" — xem /permissions/me, thứ mà chính menu dùng để biết nên
    // hiện gì.
    if (!trang || trang.length === 0) return true;

    const req = ctx.switchToHttp().getRequest<RequestWithUser>();
    const user = req.user;
    // Chưa đăng nhập thì guard xác thực toàn cục đã lo; tới đây mà không có
    // user nghĩa là handler công khai — không có vai trò nào để tra, chặn.
    if (!user) throw new ForbiddenException('Bạn không có quyền truy cập trang này');

    /* Nhiều trang thì CHỈ CẦN MỘT trang cho phép. Lấy mức cao nhất để câu báo
       lỗi nói đúng lý do: "chỉ được xem" khác hẳn "không có quyền vào", và
       người đọc cần biết mình đang vướng cái nào. */
    let cao: MucQuyen = MucQuyen.KHONG;
    for (const t of trang) {
      const m = await this.matrix.mucCua(user.roles, t);
      if (THU_TU[m] > THU_TU[cao]) cao = m;
    }
    if (!quyetDinh(cao, req.method)) {
      throw new ForbiddenException(LY_DO[cao]);
    }
    return true;
  }
}
