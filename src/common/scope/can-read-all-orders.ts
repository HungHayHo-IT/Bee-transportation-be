import { Role } from '../enums';

/**
 * Người này đọc được ĐƠN HÀNG của mọi phòng? CHỈ Admin.
 *
 * Cố tình hẹp hơn isCompanyWide(): xem báo cáo tổng và xem từng đơn là hai quyền
 * khác nhau. Ban lãnh đạo và người có cờ can_view_company_report vẫn thấy số liệu
 * toàn công ty, nhưng danh sách đơn — kèm báo giá kín và số tiền của từng phòng —
 * thì chỉ trong phạm vi phòng ban của họ.
 *
 * Dùng CHUNG ở mọi đường đọc đơn: lọc danh sách, hiển thị số tiền, báo giá kín,
 * bình luận, lịch sử báo giá. Chép tay điều kiện này ở chỗ khác là sinh lỗ hổng.
 *
 * Nhận shape tối thiểu chứ không phải AuthenticatedUser, để dùng được cả với hàng
 * user đọc thẳng từ DB (validMentions).
 */
export function canReadAllOrders(user: { roles: string[] }): boolean {
  return user.roles.includes(Role.ADMIN);
}
