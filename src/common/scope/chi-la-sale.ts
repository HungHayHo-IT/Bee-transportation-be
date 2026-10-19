import { Role } from '../enums';

/**
 * Người này CHỈ là Sale, không kiêm vai nào khác.
 *
 * Từ 07/10/2026 Sale không còn thấy đơn của phòng mình nữa — chỉ thấy đơn do
 * chính mình tạo. Trước đó mọi thành viên của một phòng đều đọc được đơn của
 * phòng đó bất kể vai trò, nên hai Sale ngồi cùng phòng đọc được đơn của nhau.
 *
 * "CHỈ là Sale" chứ không phải "có vai Sale": trưởng phòng kiêm sale vẫn phải
 * giữ tầm nhìn của trưởng phòng, nếu không họ mất luôn phòng mình đang quản.
 *
 * Dùng CHUNG ở ba nơi và phải là ba nơi duy nhất:
 *   - ScopeService.orderWhere   — ai đọc được đơn nào
 *   - ScopeService.reportScope  — dashboard phải cùng phạm vi với danh sách
 *   - NotifyService.deptRecipients — ai nhận thông báo của phòng
 * Lệch một chỗ là Sale nhận thông báo rồi bấm vào ra 404, đúng cái bẫy mà vế
 * phòng ban ngày xưa sinh ra để tránh.
 */
export function chiLaSale(roles: readonly string[]): boolean {
  return roles.length > 0 && roles.every((r) => r === Role.SALE);
}
