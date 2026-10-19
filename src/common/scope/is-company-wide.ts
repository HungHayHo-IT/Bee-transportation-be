import { Role } from '../enums';
import { AuthenticatedUser } from '../types/authenticated-user.type';

/**
 * Người này nhìn thấy dữ liệu toàn công ty?
 * Dùng CHUNG ở 4 chỗ: lọc đơn, tầng dashboard, hiển thị doanh thu, báo giá kín.
 * Chép tay điều kiện này ở bất kỳ đâu khác là sinh lỗ hổng.
 */
export function isCompanyWide(user: AuthenticatedUser): boolean {
  return (
    user.roles.includes(Role.ADMIN) ||
    user.roles.includes(Role.LEADER) ||
    user.canViewCompanyReport
  );
}
