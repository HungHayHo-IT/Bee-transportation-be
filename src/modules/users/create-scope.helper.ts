import { ForbiddenException } from '@nestjs/common';
import { Role } from '@/common/enums';

/**
 * Những vai trò một trưởng phòng được phép cấp.
 *
 * Dừng ở đây vì hai vai trò còn lại đều là đường leo thang: cấp được MANAGER là
 * tự nhân bản quyền của chính mình, cấp được LEADER là mở báo cáo toàn công ty
 * cho một người mà trưởng phòng không có quyền bổ nhiệm.
 */
export const MANAGER_GRANTABLE_ROLES: string[] = [Role.STAFF, Role.SALE, Role.DISPATCHER];

interface Actor {
  id: number;
  /** `string[]`, không phải `Role[]`: AuthenticatedUser dựng từ DB nên vai trò
   *  tới đây là chuỗi thô. So sánh thẳng với hằng Role vẫn đúng vì enum là
   *  chuỗi, và nhờ vậy nơi gọi không phải ép kiểu. */
  roles: readonly string[];
  departmentId: number | null;
  canViewCompanyReport: boolean;
}

interface Draft {
  /** Cũng là `string[]`: DTO đã lọc qua @IsIn(ALL_ROLES) nên giá trị chắc chắn
   *  hợp lệ, nhưng kiểu khai trong DTO vẫn là chuỗi. */
  roles: readonly string[];
  departmentId?: number;
  canViewCompanyReport?: boolean;
}

export interface CreateScope {
  departmentId: number | undefined;
  roles: string[];
}

/**
 * Ai được tạo tài khoản gì, cho phòng nào.
 *
 * Admin giữ nguyên quyền cũ: vai trò nào, phòng nào cũng được.
 *
 * Trưởng phòng tự tạo được tài khoản cho người của phòng mình thay vì phải nhờ
 * Admin từng lần — nhưng chỉ trong đúng ba lằn ranh, và cả ba đều là chặn leo
 * thang chứ không phải thủ tục:
 *
 * 1. Vai trò nằm trong MANAGER_GRANTABLE_ROLES.
 * 2. Phòng phải là phòng của chính họ. Bỏ trống thì điền hộ, chỉ sang phòng
 *    khác thì từ chối — không im lặng nắn về phòng mình, vì người gọi cần biết
 *    là yêu cầu của họ đã không được thực hiện như đã gõ.
 * 3. Cờ canViewCompanyReport phải tắt. Đây là chỗ kín nhất: cờ này mở báo cáo
 *    TOÀN CÔNG TY cho tài khoản được tạo dù vai trò của nó hẹp tới đâu, nên nó
 *    là một đường vòng quanh hai luật trên.
 *
 * Trả về phạm vi đã chuẩn hoá thay vì chỉ ném/không ném, để nơi gọi không phải
 * tự nhớ luật "bỏ trống thì lấy phòng của actor" một lần nữa.
 */
export function resolveCreateScope(actor: Actor, draft: Draft): CreateScope {
  if (actor.roles.includes(Role.ADMIN))
    return { departmentId: draft.departmentId, roles: [...draft.roles] };

  if (!actor.roles.includes(Role.MANAGER))
    throw new ForbiddenException('Chỉ Admin và trưởng phòng được tạo tài khoản');

  if (actor.departmentId === null)
    throw new ForbiddenException('Bạn chưa thuộc phòng ban nào nên chưa tạo được tài khoản');

  const ngoaiPhamVi = draft.roles.filter((r) => !MANAGER_GRANTABLE_ROLES.includes(r));
  if (ngoaiPhamVi.length)
    throw new ForbiddenException(
      `Trưởng phòng chỉ cấp được vai trò Nhân viên và Sale, không cấp được: ${ngoaiPhamVi.join(', ')}`,
    );

  if (draft.departmentId !== undefined && draft.departmentId !== actor.departmentId)
    throw new ForbiddenException('Trưởng phòng chỉ tạo được tài khoản cho phòng của mình');

  if (draft.canViewCompanyReport)
    throw new ForbiddenException('Trưởng phòng không bật được quyền xem báo cáo toàn công ty');

  return { departmentId: actor.departmentId, roles: [...draft.roles] };
}
