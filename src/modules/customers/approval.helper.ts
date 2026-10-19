import { ForbiddenException } from '@nestjs/common';
import { Role } from '@/common/enums';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';

/**
 * Vai CHI XEM — khong lam gi duoc tren he thong.
 *
 * Giam doc nhin thay moi thu: bao cao toan cong ty, danh sach nhan vien, so do
 * to chuc, don hang. Nhung khong tao, khong sua, khong xoa.
 */
export const READ_ONLY_ROLES: readonly Role[] = [Role.LEADER];

/**
 * Ai tao duoc ho so khach hang.
 *
 * Gan nhu ai cung tao duoc — TRU vai chi xem. Chan o day chu khong chi an nut
 * tren giao dien: an nut thi mot lan goi API thang van tao duoc.
 */
export function assertTaoDuoc(user: AuthenticatedUser): void {
  const chiXem =
    user.roles.length > 0 &&
    user.roles.every((r) => READ_ONLY_ROLES.includes(r as Role));
  if (chiXem)
    throw new ForbiddenException('Vai trò của bạn chỉ xem, không tạo hồ sơ được');
}

/**
 * Ho so nay co duoc chon khi tao don khong.
 *
 * Tu migration 052 khong con buoc duyet, nen moi ho so deu 'approved' va ham
 * nay luon dung. GIU LAI chu khong bo: cot `status` van con trong CSDL, va don
 * cu co the tro toi mot ho so da bi tu choi tu truoc khi 052 chay.
 */
export function chonDuocKhiTaoDon(status: string): boolean {
  return status === 'approved';
}
