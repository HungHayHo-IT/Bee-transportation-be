import { Role } from '../enums';

/**
 * Người này là người của công ty ĐỐI TÁC (Bee Logistics), không phải nhân viên
 * Bee Transportation?
 *
 * Dùng CHUNG ở mọi chỗ cần phân biệt, giống `canReadAllOrders`: phạm vi đơn
 * hàng, báo giá kín, số tiền, và phiên giá được phép đọc. Chép tay
 * `roles.includes('partner')` ở chỗ khác là sinh lỗ hổng — bốn chỗ cùng một
 * luật mà một chỗ quên sửa thì không ai phát hiện cho tới khi dữ liệu đã ra
 * ngoài.
 *
 * Nhận shape tối thiểu chứ không phải AuthenticatedUser, để dùng được cả với
 * hàng user đọc thẳng từ cơ sở dữ liệu.
 */
export function laDoiTac(user: { roles: readonly string[] }): boolean {
  return user.roles.includes(Role.PARTNER);
}
